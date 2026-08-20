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
import { sleep } from '../shared/utils.js';

const getDefaultRegion = () => process.env.AWS_REGION || 'us-east-1';
const TRANSIENT_ERROR_CODES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
]);
const UNREADABLE_ERROR_CODES = new Set([
    'UnauthorizedOperation',
    'AuthFailure',
    'AccessDenied',
    'AccessDeniedException',
    'OptInRequired',
    'UnknownRegion',
    'InvalidAction',
]);

const getErrorCode = (err: any): string => err?.Code || err?.code || err?.name || '';

const isTransientError = (err: any): boolean => {
    const code = getErrorCode(err);
    return TRANSIENT_ERROR_CODES.has(code) || err?.$metadata?.httpStatusCode === 429 || err?.$retryable === true;
};

const isUnreadableRegionError = (err: any): boolean => UNREADABLE_ERROR_CODES.has(getErrorCode(err));

const createEc2Client = (region: string, creds) => new EC2Client({ credentials: creds, region });

const sendWithRetry = async <T>(operation: () => Promise<T>, maxAttempts = 5): Promise<T> => {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            return await operation();
        } catch (err) {
            lastError = err;
            if (!isTransientError(err) || attempt === maxAttempts) {
                throw err;
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(Math.min(1000, 200 * attempt));
        }
    }
    throw lastError;
};

const listEnabledRegions = async (creds): Promise<string[]> => {
    const client = createEc2Client(getDefaultRegion(), creds);
    const response = await sendWithRetry(() => client.send(new DescribeRegionsCommand({ AllRegions: false })));
    return (response.Regions || [])
        .filter((region) => region.RegionName && region.OptInStatus !== 'not-opted-in')
        .map((region) => region.RegionName as string);
};

const describeAllPages = async <T>(
    sendPage: (next?: string) => Promise<{ items?: T[]; next?: string }>,
): Promise<T[]> => {
    const items: T[] = [];
    let next: string | undefined;
    do {
        // Need to do this for pagination
        // eslint-disable-next-line no-await-in-loop
        const page = await sendWithRetry(() => sendPage(next));
        if (page.items) {
            items.push(...page.items);
        }
        next = page.next;
    } while (next);
    return items;
};

const collectByEnabledRegion = async <T>(
    creds,
    loadRegion: (client: EC2Client) => Promise<T[]>,
): Promise<Record<string, T[]>> => {
    const regions = await listEnabledRegions(creds);
    const results = await Promise.all(
        regions.map(async (region) => {
            try {
                const items = await loadRegion(createEc2Client(region, creds));
                return [region, items] as const;
            } catch (err) {
                if (isUnreadableRegionError(err) || isTransientError(err)) {
                    console.log(`Skipping unreadable region ${region}`, err);
                    return null;
                }
                console.log(`Error reading region ${region}`, err);
                return null;
            }
        }),
    );

    return results.reduce(
        (acc, entry) => {
            if (entry) {
                const [region, items] = entry;
                acc[region] = items;
            }
            return acc;
        },
        {} as Record<string, T[]>,
    );
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
    return collectByEnabledRegion(creds, (ec2Client) =>
        describeAllPages(async (next) => {
            const response = await ec2Client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
            return { items: response.Volumes, next: response?.NextToken };
        }),
    );
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    console.log('Starting get all Snapshots');
    return collectByEnabledRegion(creds, (ec2Client) =>
        describeAllPages(async (next) => {
            const response = await ec2Client.send(
                new DescribeSnapshotsCommand({ Filters, OwnerIds: ['self'], NextToken: next }),
            );
            return { items: response.Snapshots, next: response?.NextToken };
        }),
    );
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
