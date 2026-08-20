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

const defaultDiscoveryRegion = () => process.env.AWS_REGION || 'us-east-1';

// Default SDK budget is 3 attempts. Some regions rate-limit the first few reads
// before answering, so inventory clients need a larger retry budget.
const INVENTORY_MAX_ATTEMPTS = 10;
const TRANSIENT_RETRY_LIMIT = 8;

const PERMANENT_READ_REFUSAL_CODES = new Set([
    'UnauthorizedOperation',
    'AuthFailure',
    'AccessDenied',
    'AccessDeniedException',
]);

const TRANSIENT_RATE_LIMIT_CODES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'RequestThrottled',
    'RequestThrottledException',
    'PriorRequestNotComplete',
    'EC2ThrottledException',
]);

const createInventoryEc2Client = (region: string, creds) =>
    new EC2Client({ region, credentials: creds, maxAttempts: INVENTORY_MAX_ATTEMPTS });

const awsErrorCode = (err: any): string => err?.name || err?.Code || err?.code || '';

const isPermanentReadRefusal = (err: any): boolean => PERMANENT_READ_REFUSAL_CODES.has(awsErrorCode(err));

const isTransientRateLimit = (err: any): boolean => {
    const status = err?.$metadata?.httpStatusCode;
    return TRANSIENT_RATE_LIMIT_CODES.has(awsErrorCode(err)) || status === 429 || status === 503;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Regions the account has actually enabled. DescribeRegions without AllRegions
 * already drops not-opted-in regions; the extra filter is defensive.
 */
export const getEnabledRegions = async (creds): Promise<string[]> => {
    const ec2Client = createInventoryEc2Client(defaultDiscoveryRegion(), creds);
    const response = await ec2Client.send(new DescribeRegionsCommand({}));
    return (response.Regions || [])
        .filter((region) => region.RegionName && region.OptInStatus !== 'not-opted-in')
        .map((region) => region.RegionName as string);
};

type RegionPage<T> = { items: T[]; next?: string };

/**
 * Read every page in one region. Permanent authorization failures return null
 * so the region is omitted. Transient rate limits are retried. Any other error
 * is isolated to this region so it cannot collapse the rest of the sweep.
 */
const collectFromRegion = async <T>(
    region: string,
    creds,
    pageFn: (client: EC2Client, next?: string) => Promise<RegionPage<T>>,
): Promise<T[] | null> => {
    const client = createInventoryEc2Client(region, creds);
    const items: T[] = [];
    let next: string | undefined;
    try {
        do {
            let page: RegionPage<T> | undefined;
            for (let attempt = 0; ; attempt += 1) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    page = await pageFn(client, next);
                    break;
                } catch (err) {
                    if (isPermanentReadRefusal(err)) {
                        console.log(`Omitting unreadable region ${region}`, awsErrorCode(err));
                        return null;
                    }
                    if (isTransientRateLimit(err) && attempt < TRANSIENT_RETRY_LIMIT) {
                        // eslint-disable-next-line no-await-in-loop
                        await delay(Math.min(1000, 50 * (attempt + 1)));
                        continue;
                    }
                    throw err;
                }
            }
            items.push(...(page?.items || []));
            next = page?.next;
        } while (next);
        return items;
    } catch (err) {
        if (isPermanentReadRefusal(err)) {
            console.log(`Omitting unreadable region ${region}`, awsErrorCode(err));
            return null;
        }
        console.log(`Error reading region ${region}; continuing with remaining regions`, err);
        return null;
    }
};

export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    console.log('Starting get all Volumes');
    const regions = await getEnabledRegions(creds);
    const volumesByRegion: Record<string, Array<Volume>> = {};

    await Promise.all(
        regions.map(async (region) => {
            const volumes = await collectFromRegion<Volume>(region, creds, async (client, token) => {
                const response = await client.send(new DescribeVolumesCommand({ Filters, NextToken: token }));
                return { items: response.Volumes || [], next: response.NextToken };
            });
            // Include readable regions even when the page set is empty; skip refusals.
            if (volumes !== null) {
                volumesByRegion[region] = volumes;
            }
        }),
    );

    return volumesByRegion;
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    console.log('Starting get all Snapshots');
    const regions = await getEnabledRegions(creds);
    const snapshotsByRegion: Record<string, Array<Snapshot>> = {};

    await Promise.all(
        regions.map(async (region) => {
            const snapshots = await collectFromRegion<Snapshot>(region, creds, async (client, token) => {
                const response = await client.send(
                    new DescribeSnapshotsCommand({ Filters, OwnerIds: ['self'], NextToken: token }),
                );
                return { items: response.Snapshots || [], next: response.NextToken };
            });
            if (snapshots !== null) {
                snapshotsByRegion[region] = snapshots;
            }
        }),
    );

    return snapshotsByRegion;
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
