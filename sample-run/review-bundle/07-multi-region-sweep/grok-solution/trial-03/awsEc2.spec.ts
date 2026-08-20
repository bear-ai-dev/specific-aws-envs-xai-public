import { mockClient } from 'aws-sdk-client-mock';
import {
    EC2Client,
    DescribeRegionsCommand,
    DescribeVolumesCommand,
    DescribeSnapshotsCommand,
} from '@aws-sdk/client-ec2';
import { getAllVolumes, getAllSnapshots } from './awsEc2.js';

const ec2Mock = mockClient(EC2Client);

describe('getAllVolumes multi-region sweep', () => {
    beforeEach(() => {
        ec2Mock.reset();
    });

    it('returns every enabled readable region, including empty ones, and omits unreadable or never-enabled regions', async () => {
        const saEastAttempts: number[] = [];

        ec2Mock.on(DescribeRegionsCommand).resolves({
            Regions: [
                { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                { RegionName: 'eu-west-1', OptInStatus: 'opt-in-not-required' },
                { RegionName: 'sa-east-1', OptInStatus: 'opted-in' },
                { RegionName: 'ap-south-1', OptInStatus: 'opted-in' },
                { RegionName: 'me-south-1', OptInStatus: 'not-opted-in' },
            ],
        });

        ec2Mock.on(DescribeVolumesCommand).callsFake(async (input, getClient) => {
            const region = await getClient().config.region();
            if (region === 'ap-south-1') {
                const err: any = new Error('You are not authorized to perform this operation in this Region');
                err.Code = 'UnauthorizedOperation';
                err.name = 'UnauthorizedOperation';
                err.$metadata = { httpStatusCode: 403 };
                throw err;
            }
            if (region === 'sa-east-1') {
                saEastAttempts.push(1);
                if (saEastAttempts.length < 3) {
                    const err: any = new Error('Request limit exceeded');
                    err.Code = 'RequestLimitExceeded';
                    err.name = 'RequestLimitExceeded';
                    err.$metadata = { httpStatusCode: 503 };
                    throw err;
                }
                return {
                    Volumes: [{ VolumeId: 'vol-sa', Size: 20, VolumeType: 'gp3' }],
                };
            }
            if (region === 'us-east-1') {
                return {
                    Volumes: [{ VolumeId: 'vol-use1', Size: 10, VolumeType: 'gp2' }],
                };
            }
            return { Volumes: [] };
        });

        const volumes = await getAllVolumes({});

        expect(Object.keys(volumes).sort()).toEqual(['eu-west-1', 'sa-east-1', 'us-east-1']);
        expect(volumes['us-east-1']).toHaveLength(1);
        expect(volumes['eu-west-1']).toEqual([]);
        expect(volumes['sa-east-1'][0].VolumeId).toBe('vol-sa');
        expect(volumes).not.toHaveProperty('ap-south-1');
        expect(volumes).not.toHaveProperty('me-south-1');
        expect(saEastAttempts.length).toBeGreaterThanOrEqual(3);
    });

    it('does not collapse the sweep when one region permanently refuses reads', async () => {
        ec2Mock.on(DescribeRegionsCommand).resolves({
            Regions: [
                { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                { RegionName: 'ap-south-1', OptInStatus: 'opted-in' },
            ],
        });
        ec2Mock.on(DescribeVolumesCommand).callsFake(async (_input, getClient) => {
            const region = await getClient().config.region();
            if (region === 'ap-south-1') {
                const err: any = new Error('denied');
                err.Code = 'UnauthorizedOperation';
                throw err;
            }
            return { Volumes: [] };
        });

        const volumes = await getAllVolumes({});
        expect(volumes).toEqual({ 'us-east-1': [] });
    });
});

describe('getAllSnapshots multi-region sweep', () => {
    beforeEach(() => {
        ec2Mock.reset();
    });

    it('omits permanently unreadable snapshot regions without dropping the rest', async () => {
        ec2Mock.on(DescribeRegionsCommand).resolves({
            Regions: [
                { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                { RegionName: 'ap-northeast-2', OptInStatus: 'opted-in' },
            ],
        });
        ec2Mock.on(DescribeSnapshotsCommand).callsFake(async (_input, getClient) => {
            const region = await getClient().config.region();
            if (region === 'ap-northeast-2') {
                const err: any = new Error('denied');
                err.Code = 'UnauthorizedOperation';
                throw err;
            }
            return { Snapshots: [] };
        });

        const snapshots = await getAllSnapshots({});
        expect(snapshots).toEqual({ 'us-east-1': [] });
    });
});
