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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Default AWS SDK retry budget is too small for a region that rate-limits the first
// few inventory reads. We disable the client retry loop and handle it ourselves.
const EC2_CLIENT_MAX_ATTEMPTS = 1;
const MAX_TRANSIENT_RETRIES = 8;

const TRANSIENT_ERROR_NAMES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'PriorRequestNotComplete',
    'EC2ThrottledException',
    'ServiceUnavailable',
    'InternalError',
    'InternalFailure',
    'RequestThrottled',
    'RequestThrottledException',
]);

const errorName = (err: any): string => err?.name || err?.Code || err?.code || '';

const isTransientError = (err: any): boolean => {
    const status = err?.$metadata?.httpStatusCode;
    return (
        TRANSIENT_ERROR_NAMES.has(errorName(err)) ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    );
};

const createEc2Client = (region: string, creds) =>
    new EC2Client({
        credentials: creds,
        region,
        maxAttempts: EC2_CLIENT_MAX_ATTEMPTS,
    });

const sendWithRetry = async <T>(client: EC2Client, command: any): Promise<T> => {
    let retryCounter = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return (await client.send(command)) as T;
        } catch (error) {
            if (isTransientError(error) && retryCounter < MAX_TRANSIENT_RETRIES) {
                retryCounter += 1;
                // geometric backoff with jitter, matching the CloudTrail gatherer
                // eslint-disable-next-line no-await-in-loop
                await sleep(200 * Math.random() * retryCounter);
                continue;
            }
            throw error;
        }
    }
};

const listEnabledRegions = async (creds): Promise<string[]> => {
    const discoveryRegion = process.env.AWS_REGION || 'us-east-1';
    const ec2Client = createEc2Client(discoveryRegion, creds);
    // Default DescribeRegions returns only regions the account has enabled.
    // We still drop not-opted-in entries in case a caller asked for AllRegions elsewhere.
    const response = await sendWithRetry<{ Regions?: Array<{ RegionName?: string; OptInStatus?: string }> }>(
        ec2Client,
        new DescribeRegionsCommand({}),
    );
    return (response.Regions || [])
        .filter((region) => region.RegionName && region.OptInStatus !== 'not-opted-in')
        .map((region) => region.RegionName as string);
};

const collectAcrossEnabledRegions = async <T>(
    creds,
    collectRegion: (region: string) => Promise<T[]>,
): Promise<Record<string, T[]>> => {
    const regions = await listEnabledRegions(creds);
    const collected = await Promise.all(
        regions.map(async (region) => {
            try {
                const items = await collectRegion(region);
                // An enabled, readable region is returned even when the page is empty.
                return [region, items] as const;
            } catch (err) {
                // Permanent refusals and exhausted rate limits stay local so one
                // bad region cannot collapse inventory from the rest of the account.
                console.log(`Skipping region ${region} while sweeping block storage`, err);
                return null;
            }
        }),
    );
    return Object.fromEntries(collected.filter((entry): entry is readonly [string, T[]] => entry !== null));
};

const paginateDescribe = async <T>(
    creds,
    region: string,
    sendPage: (client: EC2Client, next?: string) => Promise<{ items?: T[]; next?: string }>,
): Promise<T[]> => {
    const ec2Client = createEc2Client(region, creds);
    const items: T[] = [];
    let next: string | undefined;
    do {
        // Need to do this for pagination
        // eslint-disable-next-line no-await-in-loop
        const page = await sendPage(ec2Client, next);
        next = page.next;
        if (page.items) {
            items.push(...page.items);
        }
    } while (next);
    return items;
};

export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    console.log('Starting get all Volumes across enabled regions');
    return collectAcrossEnabledRegions<Volume>(creds, async (region) => {
        return paginateDescribe<Volume>(creds, region, async (client, next) => {
            const response = await sendWithRetry<{ Volumes?: Volume[]; NextToken?: string }>(
                client,
                new DescribeVolumesCommand({ Filters, NextToken: next }),
            );
            return { items: response.Volumes, next: response.NextToken };
        });
    });
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    console.log('Starting get all Snapshots across enabled regions');
    return collectAcrossEnabledRegions<Snapshot>(creds, async (region) => {
        return paginateDescribe<Snapshot>(creds, region, async (client, next) => {
            const response = await sendWithRetry<{ Snapshots?: Snapshot[]; NextToken?: string }>(
                client,
                new DescribeSnapshotsCommand({ Filters, OwnerIds: ['self'], NextToken: next }),
            );
            return { items: response.Snapshots, next: response.NextToken };
        });
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
