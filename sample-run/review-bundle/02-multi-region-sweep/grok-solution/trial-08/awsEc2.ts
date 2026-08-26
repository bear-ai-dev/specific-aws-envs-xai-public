import {
    EC2Client,
    DescribeInstancesCommand,
    DescribeInstanceTypesCommand,
    DescribeVolumesCommand,
    DescribeSnapshotsCommand,
    DescribeReservedInstancesCommand,
    DescribeRegionsCommand,
    Filter,
    Volume,
    Snapshot,
    _InstanceType,
} from '@aws-sdk/client-ec2';
import flattenDeep from 'lodash.flattendeep';
import { BadRequestException } from '@nestjs/common';

const MAX_TRANSIENT_ATTEMPTS = 5;

const getAwsErrorCode = (err: any): string => err?.Code || err?.code || err?.name || err?.__type || '';

const isTransientAwsError = (err: any): boolean => {
    const code = getAwsErrorCode(err);
    const status = err?.$metadata?.httpStatusCode;
    return (
        code === 'RequestLimitExceeded' ||
        code === 'Throttling' ||
        code === 'ThrottlingException' ||
        code === 'TooManyRequestsException' ||
        status === 429 ||
        status === 503
    );
};

const isUnreadableRegionError = (err: any): boolean => {
    const code = getAwsErrorCode(err);
    const status = err?.$metadata?.httpStatusCode;
    return (
        code === 'UnauthorizedOperation' ||
        code === 'AuthFailure' ||
        code === 'AccessDenied' ||
        code === 'OptInRequired' ||
        status === 401 ||
        status === 403
    );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sendWithTransientRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await operation();
        } catch (err) {
            attempt += 1;
            if (!isTransientAwsError(err) || attempt >= MAX_TRANSIENT_ATTEMPTS) {
                throw err;
            }
            // geometric backoff with jitter, matching the CloudTrail gatherer
            // eslint-disable-next-line no-await-in-loop
            await sleep(200 * Math.random() * attempt);
        }
    }
};

const listEnabledRegions = async (creds): Promise<string[]> => {
    const discoveryRegion = process.env.AWS_REGION || 'us-east-1';
    const ec2Client = new EC2Client({ credentials: creds, region: discoveryRegion });
    const response = await sendWithTransientRetry(() =>
        ec2Client.send(new DescribeRegionsCommand({ AllRegions: true })),
    );
    return (response.Regions || [])
        .filter((region) => region.RegionName && region.OptInStatus !== 'not-opted-in')
        .map((region) => region.RegionName as string);
};

const collectPerEnabledRegion = async <T>(
    creds,
    describePage: (client: EC2Client, next?: string) => Promise<{ items: T[]; next?: string }>,
): Promise<Record<string, T[]>> => {
    const regions = await listEnabledRegions(creds);
    const inventory: Record<string, T[]> = {};
    await Promise.all(
        regions.map(async (region) => {
            try {
                const ec2Client = new EC2Client({ credentials: creds, region });
                const items: T[] = [];
                let next: string | undefined;
                do {
                    // Need to do this for pagination
                    // eslint-disable-next-line no-await-in-loop
                    const page = await sendWithTransientRetry(() => describePage(ec2Client, next));
                    items.push(...page.items);
                    next = page.next;
                } while (next);
                inventory[region] = items;
            } catch (err) {
                // Permanently unreadable regions are omitted so they cannot collapse inventory
                // from the remaining enabled regions. Transient rate limits are retried above
                // and only land here if they never recover.
                if (isUnreadableRegionError(err) || isTransientAwsError(err)) {
                    console.log(`Omitting region ${region} from block-storage inventory`, err);
                    return;
                }
                console.log(`Omitting unexpected failure for region ${region}`, err);
            }
        }),
    );
    return inventory;
};

export const getInstanceWithFilters = async (region, creds, filters = []): Promise<any> => {
    try {
        const ec2Client = new EC2Client({ region, credentials: creds });
        let instances = [];
        let next;
        do {
            const response = await ec2Client.send(new DescribeInstancesCommand({ NextToken: next, Filters: filters }));
            next = response?.NextToken;
            const { Reservations } = response;
            Reservations.forEach((reservation) => {
                const { Instances } = reservation;
                instances = instances.concat(Instances);
            });
        } while (next);
        return instances;
    } catch (err) {
        console.log('Error', err);
        if (err.Code === 'AccessDenied') {
            throw new BadRequestException('Invalid IAM role or external ID');
        } else {
            throw new BadRequestException('Error fetching instances');
        }
    }
};

export const getAllInstanceIDs = async (
    region,
    creds,
    tagList = [],
): Promise<
    Array<{
        InstanceId: string;
        State: string;
        Tags: Array<string>;
        Memory: string;
        LaunchTime: string;
        CpuCores: string;
        PrivateDnsName: string;
        InstanceType: string;
        region: string;
    }>
> => {
    try {
        const ec2Client = new EC2Client({ region, credentials: creds });
        const instanceMetaData = [];
        let next;
        do {
            // Update this to take optional parameters for instance status, enabling fine grain querying
            // Additionally enable tag filtering
            // Need to do this for pagination
            // eslint-disable-next-line no-await-in-loop
            const response = await ec2Client.send(new DescribeInstancesCommand({ NextToken: next, Filters: tagList }));
            next = response?.NextToken;
            const { Reservations } = response;
            instanceMetaData.push(
                Reservations.map(({ Instances }) => {
                    return Instances.map(
                        ({
                            InstanceType,
                            Tags,
                            InstanceId,
                            PlatformDetails,
                            State,
                            LaunchTime,
                            CpuOptions,
                            PrivateDnsName,
                        }) => {
                            try {
                                return {
                                    InstanceId,
                                    InstanceType,
                                    PlatformDetails,
                                    State,
                                    Tags,
                                    LaunchTime,
                                    CpuCores: CpuOptions.CoreCount,
                                    PrivateDnsName,
                                };
                            } catch (error) {
                                console.log(error);
                                return false;
                            }
                        },
                    );
                }),
            );
        } while (next);

        const flattenedInstanceList = flattenDeep(instanceMetaData);
        const instanceTypes = flattenedInstanceList.reduce((acc, { InstanceType }) => {
            acc[InstanceType] = true;
            return acc;
        }, {});
        let additionalInstanceMetadata = {};
        do {
            const instanceTypeList = Object.keys(instanceTypes) as _InstanceType[];
            // Need to do this for pagination
            // eslint-disable-next-line no-await-in-loop
            const response = await ec2Client.send(
                new DescribeInstanceTypesCommand({ NextToken: next, InstanceTypes: instanceTypeList }),
            );
            next = response?.NextToken;
            const { InstanceTypes } = response;

            const res = InstanceTypes.reduce((acc, { MemoryInfo, InstanceType }) => {
                acc[InstanceType] = { Memory: MemoryInfo?.SizeInMiB, InstanceType };
                return acc;
            }, additionalInstanceMetadata);
            additionalInstanceMetadata = { ...additionalInstanceMetadata, ...res };
        } while (next);
        return flattenedInstanceList.map((instance) => {
            return {
                ...instance,
                ...additionalInstanceMetadata[instance.InstanceType],
                region,
            };
        });
    } catch (err) {
        console.log('Error', err);
        if (err.Code === 'AccessDenied') throw new BadRequestException('Invalid IAM role or external ID');
    }
};

export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    console.log('Starting get all Volumes');
    return collectPerEnabledRegion(creds, async (ec2Client, next) => {
        const response = await ec2Client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
        return { items: response.Volumes || [], next: response.NextToken };
    });
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    console.log('Starting get all Snapshots');
    return collectPerEnabledRegion(creds, async (ec2Client, next) => {
        const response = await ec2Client.send(
            new DescribeSnapshotsCommand({ Filters, OwnerIds: ['self'], NextToken: next }),
        );
        return { items: response.Snapshots || [], next: response.NextToken };
    });
};

export const getReservedInstanceCount = async (creds, region, filters) => {
    const ec2Client = new EC2Client({ region, credentials: creds });

    const response = await ec2Client.send(new DescribeReservedInstancesCommand({ Filters: filters }));

    const { ReservedInstances } = response;

    return ReservedInstances.map(
        ({
            InstanceType,
            InstanceCount,
            InstanceTenancy,
            End,
            Start,
            FixedPrice,
            AvailabilityZone,
            RecurringCharges,
            ReservedInstancesId,
            OfferingType,
        }) => ({
            InstanceType,
            InstanceCount,
            InstanceTenancy,
            FixedPrice,
            End,
            Start,
            AvailabilityZone,
            RecurringCharges,
            ReservedInstancesId,
            OfferingType,
        }),
    );
};
