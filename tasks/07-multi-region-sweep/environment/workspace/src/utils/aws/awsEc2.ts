import {
    EC2Client,
    DescribeInstancesCommand,
    DescribeInstanceTypesCommand,
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

export const getAllVolumes = async (creds, Filters: Array<Filter> = []): Promise<Record<string, Array<Volume>>> => {
    const region = process.env.AWS_REGION || 'us-east-1';
    console.log('Starting get all Volumes', region);
    const ec2Client = new EC2Client({ credentials: creds, region });
    const volumes = [];
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

    return { [region]: volumes };
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
