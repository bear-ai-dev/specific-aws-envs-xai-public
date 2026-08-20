import { DescribeRegionsCommand, DescribeVolumesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import { getAllVolumes, isPermanentlyUnreadableEc2Error, isTransientEc2Error } from './awsEc2.js';

const ec2Mock = mockClient(EC2Client);

const unauthorizedError = Object.assign(new Error('You are not authorized to perform this operation in this Region'), {
    name: 'UnauthorizedOperation',
    Code: 'UnauthorizedOperation',
    $fault: 'client',
    $metadata: { httpStatusCode: 403 },
});

const rateLimitError = Object.assign(new Error('Request limit exceeded'), {
    name: 'RequestLimitExceeded',
    Code: 'RequestLimitExceeded',
    $fault: 'client',
    $metadata: { httpStatusCode: 503 },
});

describe('getAllVolumes', () => {
    const creds = { accessKeyId: '<redacted>', secretAccessKey: '<redacted>' };

    beforeEach(() => {
        ec2Mock.reset();
    });

    it('classifies rate limits as transient and authorization failures as permanently unreadable', () => {
        expect(isTransientEc2Error(rateLimitError)).toBe(true);
        expect(isPermanentlyUnreadableEc2Error(unauthorizedError)).toBe(true);
        expect(isTransientEc2Error(unauthorizedError)).toBe(false);
    });

    it('discovers enabled regions, keeps empty readable ones, retries rate limits, and omits unreadable or never-enabled regions', async () => {
        let saAttempts = 0;

        ec2Mock.on(DescribeRegionsCommand).resolves({
            Regions: [
                { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                { RegionName: 'eu-west-1', OptInStatus: 'opt-in-not-required' },
                { RegionName: 'sa-east-1', OptInStatus: 'opted-in' },
                { RegionName: 'ap-south-1', OptInStatus: 'opted-in' },
                { RegionName: 'me-south-1', OptInStatus: 'not-opted-in' },
            ],
        });

        ec2Mock.on(DescribeVolumesCommand).callsFake(async (_input, getClient) => {
            const region = await getClient().config.region();
            if (region === 'ap-south-1') {
                throw unauthorizedError;
            }
            if (region === 'sa-east-1') {
                saAttempts += 1;
                if (saAttempts === 1) {
                    throw rateLimitError;
                }
                return { Volumes: [] };
            }
            if (region === 'us-east-1') {
                return {
                    Volumes: [
                        {
                            VolumeId: 'vol-123',
                            Size: 10,
                            AvailabilityZone: 'us-east-1a',
                        },
                    ],
                };
            }
            return { Volumes: [] };
        });

        const result = await getAllVolumes(creds);

        expect(Object.keys(result).sort()).toEqual(['eu-west-1', 'sa-east-1', 'us-east-1']);
        expect(result['eu-west-1']).toEqual([]);
        expect(result['sa-east-1']).toEqual([]);
        expect(result['us-east-1']).toHaveLength(1);
        expect(result['ap-south-1']).toBeUndefined();
        expect(result['me-south-1']).toBeUndefined();
        expect(saAttempts).toBeGreaterThan(1);
    });

    it('does not let one unreadable region collapse inventory from the remaining regions', async () => {
        ec2Mock.on(DescribeRegionsCommand).resolves({
            Regions: [
                { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                { RegionName: 'ap-south-1', OptInStatus: 'opted-in' },
            ],
        });
        ec2Mock.on(DescribeVolumesCommand).callsFake(async (_input, getClient) => {
            const region = await getClient().config.region();
            if (region === 'ap-south-1') {
                throw unauthorizedError;
            }
            return { Volumes: [] };
        });

        await expect(getAllVolumes(creds)).resolves.toEqual({ 'us-east-1': [] });
    });
});
