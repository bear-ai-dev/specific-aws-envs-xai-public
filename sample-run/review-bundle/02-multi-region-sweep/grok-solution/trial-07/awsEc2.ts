import {
    EC2Client,
    DescribeInstancesCommand,
    DescribeInstanceTypesCommand,
    DescribeRegionsCommand,
    DescribeVolumesCommand,
    DescribeSnapshotsCommand,
    DescribeReservedInstancesCommand,
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

const TRANSIENT_RATE_LIMIT_CODES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'ServiceUnavailable',
    'PriorRequestNotComplete',
]);

const isTransientRateLimitError = (err: any): boolean => {
    const code = err?.Code || err?.name || err?.code;
    const status = err?.$metadata?.httpStatusCode;
    return TRANSIENT_RATE_LIMIT_CODES.has(code) || status === 429 || status === 503;
};

const describeVolumesForRegion = async (region: string, creds, Filters: Array<Filter>): Promise<Array<Volume>> => {
    const ec2Client = new EC2Client({ credentials: creds, region });
    const volumes: Array<Volume> = [];
    let next: string;
    let retryLoop = false;
    let retryCounter = 0;
    const MAX_ATTEMPTS = 5;

    do {
        retryLoop = false;
        try {
            // Need to do this for pagination
            // eslint-disable-next-line no-await-in-loop
            const response = await ec2Client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
            next = response?.NextToken;
            if (response.Volumes) {
                volumes.push(...response.Volumes);
            }
            retryCounter = 0;
        } catch (err) {
            if (retryCounter >= MAX_ATTEMPTS) {
                throw err;
            }
            if (isTransientRateLimitError(err)) {
                retryLoop = true;
                retryCounter += 1;
                // eslint-disable-next-line no-await-in-loop
                await sleep(200 * Math.random() * retryCounter);
            } else {
                throw err;
            }
        }
    } while (next || retryLoop);

    return volumes;
};

export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    const discoveryRegion = process.env.AWS_REGION || 'us-east-1';
    console.log('Starting get all Volumes', discoveryRegion);
    const discoveryClient = new EC2Client({ credentials: creds, region: discoveryRegion });
    // Discover every region, then keep only those the account has enabled
    const { Regions = [] } = await discoveryClient.send(new DescribeRegionsCommand({ AllRegions: true }));
    const enabledRegions = Regions.filter(
        ({ RegionName, OptInStatus }) => Boolean(RegionName) && OptInStatus !== 'not-opted-in',
    ).map(({ RegionName }) => RegionName as string);

    const inventory: Record<string, Array<Volume>> = {};
    await Promise.all(
        enabledRegions.map(async (region) => {
            try {
                inventory[region] = await describeVolumesForRegion(region, creds, Filters);
            } catch (err) {
                // Permanently unreadable regions must be omitted without collapsing the sweep
                console.log(`Skipping unreadable region ${region}`, err);
            }
        }),
    );

    return inventory;
};

export const getAllSnapshots = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Snapshot>>> => {
    const region = process.env.AWS_REGION || 'us-east-1';
    console.log('Starting get all Snapshots', region);
    const ec2Client = new EC2Client({ credentials: creds, region });
    const snapshots = [];
    let next: string;
    do {
        // Need to do this for pagination
        // eslint-disable-next-line no-await-in-loop
        const response = await ec2Client.send(
            new DescribeSnapshotsCommand({ Filters, OwnerIds: ['self'], NextToken: next }),
        );
        next = response?.NextToken;
        if (response.Snapshots) {
            snapshots.push(...response.Snapshots);
        }
    } while (next);

    return { [region]: snapshots };
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
