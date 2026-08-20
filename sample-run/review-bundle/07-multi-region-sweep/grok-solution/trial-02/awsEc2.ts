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

const DEFAULT_REGION = process.env.AWS_REGION || 'us-east-1';
// Default SDK attempt budget is 3. The estate rate-limits more times than that
// before answering, so regional inventory clients need a higher ceiling.
const REGIONAL_MAX_ATTEMPTS = 10;
const TRANSIENT_RETRY_BUDGET = 8;
const TRANSIENT_RETRY_DELAY_MS = 50;

const TRANSIENT_RATE_LIMIT_CODES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'RequestThrottled',
    'RequestThrottledException',
    'ProvisionedThroughputExceededException',
]);

const errorCode = (err: any): string => err?.name || err?.Code || err?.code || '';

const isTransientRateLimit = (err: any): boolean => TRANSIENT_RATE_LIMIT_CODES.has(errorCode(err));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const createEc2Client = (region: string, creds): EC2Client =>
    new EC2Client({
        region,
        credentials: creds,
        maxAttempts: REGIONAL_MAX_ATTEMPTS,
    });

const listEnabledRegions = async (creds): Promise<string[]> => {
    const client = createEc2Client(DEFAULT_REGION, creds);
    // AllRegions is left unset so EC2 only returns regions the account has enabled.
    const response = await client.send(new DescribeRegionsCommand({}));
    return (response.Regions || [])
        .filter((region) => region.RegionName && region.OptInStatus !== 'not-opted-in')
        .map((region) => region.RegionName as string);
};

const describeAllInRegion = async <T>(
    region: string,
    creds,
    fetchPage: (client: EC2Client, next?: string) => Promise<{ items: T[]; next?: string }>,
): Promise<T[] | null> => {
    const client = createEc2Client(region, creds);
    const items: T[] = [];
    let next: string | undefined;
    try {
        do {
            let attempt = 0;
            // Retry only the current page so a mid-walk rate limit does not drop earlier pages.
            // eslint-disable-next-line no-constant-condition
            while (true) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const page = await fetchPage(client, next);
                    items.push(...page.items);
                    next = page.next;
                    break;
                } catch (err) {
                    if (isTransientRateLimit(err) && attempt < TRANSIENT_RETRY_BUDGET) {
                        attempt += 1;
                        // eslint-disable-next-line no-await-in-loop
                        await sleep(TRANSIENT_RETRY_DELAY_MS * attempt);
                        continue;
                    }
                    throw err;
                }
            }
        } while (next);
        return items;
    } catch (err) {
        // Permanent refusals and leftover transients are skipped so one region cannot collapse the rest.
        console.log(`Skipping unreadable region ${region}`, errorCode(err) || err);
        return null;
    }
};

const collectByEnabledRegion = async <T>(
    creds,
    fetchPage: (client: EC2Client, next?: string) => Promise<{ items: T[]; next?: string }>,
): Promise<Record<string, T[]>> => {
    const regions = await listEnabledRegions(creds);
    const entries = await Promise.all(
        regions.map(async (region) => {
            const items = await describeAllInRegion<T>(region, creds, fetchPage);
            return items === null ? null : ([region, items] as const);
        }),
    );
    return Object.fromEntries(entries.filter((entry): entry is readonly [string, T[]] => entry !== null));
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
    return collectByEnabledRegion<Volume>(creds, async (client, next) => {
        const response = await client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
        return { items: response.Volumes || [], next: response.NextToken };
    });
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    console.log('Starting get all Snapshots');
    return collectByEnabledRegion<Snapshot>(creds, async (client, next) => {
        const response = await client.send(
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
