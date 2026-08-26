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

const RETRYABLE_REGION_ERROR_CODES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'PriorRequestNotComplete',
]);

const UNREADABLE_REGION_ERROR_CODES = new Set([
    'UnauthorizedOperation',
    'AuthFailure',
    'AccessDenied',
    'AccessDeniedException',
    'OptInRequired',
    'UnknownRegion',
    'InvalidClientTokenId',
]);

const MAX_REGION_READ_ATTEMPTS = 5;

const getAwsErrorCode = (error): string => error?.Code || error?.name || error?.__type || '';

const isRetryableRegionError = (error): boolean => RETRYABLE_REGION_ERROR_CODES.has(getAwsErrorCode(error));

const sendWithTransientRetry = async <T>(send: () => Promise<T>): Promise<T> => {
    let retryCounter = 0;
    while (true) {
        try {
            return await send();
        } catch (error) {
            if (!isRetryableRegionError(error) || retryCounter >= MAX_REGION_READ_ATTEMPTS) {
                throw error;
            }
            retryCounter += 1;
            // geometric backoff with jitter, exponential is for nerds
            // eslint-disable-next-line no-await-in-loop
            await sleep(200 * Math.random() * retryCounter);
        }
    }
};

const getEnabledRegions = async (creds): Promise<string[]> => {
    const region = process.env.AWS_REGION || 'us-east-1';
    const ec2Client = new EC2Client({ credentials: creds, region });
    const response = await sendWithTransientRetry(() =>
        ec2Client.send(new DescribeRegionsCommand({ AllRegions: true })),
    );
    return (response.Regions || [])
        .filter(({ RegionName, OptInStatus }) => RegionName && OptInStatus !== 'not-opted-in')
        .map(({ RegionName }) => RegionName);
};

const collectFromEnabledRegions = async <T>(
    creds,
    collect: (ec2Client: EC2Client) => Promise<T[]>,
): Promise<Record<string, T[]>> => {
    const enabledRegions = await getEnabledRegions(creds);
    const inventory = await Promise.all(
        enabledRegions.map(async (region) => {
            try {
                const ec2Client = new EC2Client({ credentials: creds, region });
                const items = await collect(ec2Client);
                return [region, items] as const;
            } catch (error) {
                const code = getAwsErrorCode(error);
                if (UNREADABLE_REGION_ERROR_CODES.has(code) || isRetryableRegionError(error)) {
                    console.log(`Skipping unreadable region ${region}`, error);
                    return null;
                }
                console.log(`Skipping unexpected region failure ${region}`, error);
                return null;
            }
        }),
    );

    return inventory.reduce(
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

const paginateDescribe = async <T>(
    sendPage: (next?: string) => Promise<{ items?: T[]; next?: string }>,
): Promise<T[]> => {
    const items: T[] = [];
    let next: string;
    do {
        // Need to do this for pagination
        // eslint-disable-next-line no-await-in-loop
        const response = await sendWithTransientRetry(() => sendPage(next));
        next = response?.next;
        if (response.items) {
            items.push(...response.items);
        }
    } while (next);
    return items;
};

export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    console.log('Starting get all Volumes');
    return collectFromEnabledRegions(creds, async (ec2Client) =>
        paginateDescribe(async (next) => {
            const response = await ec2Client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
            return { items: response.Volumes, next: response?.NextToken };
        }),
    );
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    console.log('Starting get all Snapshots');
    return collectFromEnabledRegions(creds, async (ec2Client) =>
        paginateDescribe(async (next) => {
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
