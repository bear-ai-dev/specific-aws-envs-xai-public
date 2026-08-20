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

const TRANSIENT_EC2_ERROR_CODES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'ServiceUnavailable',
    'RequestTimeout',
    'InternalError',
    'InternalFailure',
    'PriorRequestNotComplete',
    'SlowDown',
    'Unavailable',
]);

const PERMANENTLY_UNREADABLE_EC2_ERROR_CODES = new Set([
    'UnauthorizedOperation',
    'AuthFailure',
    'AccessDenied',
    'AccessDeniedException',
    'InvalidClientTokenId',
    'OptInRequired',
    'UnknownEndpoint',
    'UnknownRegion',
]);

const getErrorCode = (err: any): string => err?.Code || err?.code || err?.name || '';

export const isTransientEc2Error = (err: any): boolean => {
    if (!err) {
        return false;
    }
    if (err.$retryable) {
        return true;
    }
    return TRANSIENT_EC2_ERROR_CODES.has(getErrorCode(err));
};

export const isPermanentlyUnreadableEc2Error = (err: any): boolean => {
    if (!err) {
        return false;
    }
    return PERMANENTLY_UNREADABLE_EC2_ERROR_CODES.has(getErrorCode(err));
};

const withTransientRetry = async <T>(operation: () => Promise<T>, maxAttempts = 5, baseDelayMs = 150): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (err) {
            lastError = err;
            if (!isTransientEc2Error(err) || attempt === maxAttempts - 1) {
                throw err;
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(baseDelayMs * 2 ** attempt);
        }
    }
    throw lastError;
};

const listEnabledRegions = async (creds, fallbackRegion: string): Promise<string[]> => {
    const discoveryClient = new EC2Client({ credentials: creds, region: fallbackRegion });
    const response = await discoveryClient.send(new DescribeRegionsCommand({ AllRegions: true }));
    return (response.Regions || [])
        .filter((region) => region.RegionName && region.OptInStatus !== 'not-opted-in')
        .map((region) => region.RegionName as string);
};

const listVolumesInRegion = async (creds, region: string, Filters: Array<Filter>): Promise<Volume[]> => {
    const ec2Client = new EC2Client({ credentials: creds, region });
    const volumes: Volume[] = [];
    let next: string;
    do {
        // Need to do this for pagination
        // eslint-disable-next-line no-await-in-loop
        const response = await ec2Client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
        next = response?.NextToken;
        if (response.Volumes) {
            volumes.push(...response.Volumes);
        }
    } while (next);
    return volumes;
};

export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    const fallbackRegion = process.env.AWS_REGION || 'us-east-1';
    console.log('Starting get all Volumes', fallbackRegion);

    let enabledRegions: string[];
    try {
        enabledRegions = await withTransientRetry(() => listEnabledRegions(creds, fallbackRegion));
    } catch (err) {
        console.log('Error discovering enabled regions, falling back to configured region', err);
        enabledRegions = [fallbackRegion];
    }

    const volumesByRegion = await Promise.all(
        enabledRegions.map(async (region) => {
            try {
                const volumes = await withTransientRetry(() => listVolumesInRegion(creds, region, Filters));
                return [region, volumes] as const;
            } catch (err) {
                // Permanently unreadable and unexpected regional failures must not collapse the sweep.
                console.log(`Skipping unreadable region ${region}`, getErrorCode(err), err);
                return null;
            }
        }),
    );

    return volumesByRegion.reduce<Record<string, Array<Volume>>>((acc, entry) => {
        if (entry) {
            const [region, volumes] = entry;
            acc[region] = volumes;
        }
        return acc;
    }, {});
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
