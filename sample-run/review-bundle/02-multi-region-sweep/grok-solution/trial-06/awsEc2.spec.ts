import {
    EC2Client,
    DescribeRegionsCommand,
    DescribeVolumesCommand,
    DescribeSnapshotsCommand,
} from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import { getAllVolumes, getAllSnapshots, getEnabledRegions } from './awsEc2.js';

const ec2Mock = mockClient(EC2Client);

const enabledRegions = [
    { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
    { RegionName: 'eu-west-1', OptInStatus: 'opt-in-not-required' },
    { RegionName: 'eu-central-1', OptInStatus: 'opt-in-not-required' },
    { RegionName: 'ap-south-1', OptInStatus: 'opted-in' },
    { RegionName: 'ap-northeast-2', OptInStatus: 'opted-in' },
    { RegionName: 'sa-east-1', OptInStatus: 'opted-in' },
];

const creds = { accessKeyId: 'AKIA', secretAccessKey: 'secret' };

const awsError = (name: string, httpStatusCode: number) => {
    const err = new Error(name) as Error & { name: string; $metadata: { httpStatusCode: number } };
    err.name = name;
    err.$metadata = { httpStatusCode };
    return err;
};

describe('block storage inventory sweep', () => {
    beforeEach(() => {
        ec2Mock.reset();
    });

    it('discovers enabled regions and ignores not-opted-in ones', async () => {
        ec2Mock.on(DescribeRegionsCommand).resolves({
            Regions: [...enabledRegions, { RegionName: 'me-south-1', OptInStatus: 'not-opted-in' }],
        });

        await expect(getEnabledRegions(creds)).resolves.toEqual(enabledRegions.map((r) => r.RegionName));
    });

    it('returns an empty readable region, omits a permanently unreadable one, and retries rate limits', async () => {
        const volumeCalls: string[] = [];

        ec2Mock.on(DescribeRegionsCommand).resolves({ Regions: enabledRegions });
        ec2Mock.on(DescribeVolumesCommand).callsFake(async (_input, getClient) => {
            const client = getClient ? getClient() : undefined;
            const region =
                (typeof client?.config?.region === 'function'
                    ? await client.config.region()
                    : client?.config?.region) || 'unknown';
            volumeCalls.push(region);

            if (region === 'ap-south-1') {
                throw awsError('UnauthorizedOperation', 403);
            }
            if (region === 'sa-east-1') {
                const prior = volumeCalls.filter((r) => r === 'sa-east-1').length;
                if (prior <= 4) {
                    throw awsError('RequestLimitExceeded', 503);
                }
                return { Volumes: [{ VolumeId: 'vol-sa', Size: 45 }] };
            }
            if (region === 'eu-central-1') {
                return { Volumes: [] };
            }
            return { Volumes: [{ VolumeId: `vol-${region}`, Size: 10 }] };
        });

        const volumes = await getAllVolumes(creds, []);

        expect(Object.keys(volumes).sort()).toEqual(
            ['ap-northeast-2', 'eu-central-1', 'eu-west-1', 'sa-east-1', 'us-east-1'].sort(),
        );
        expect(volumes['eu-central-1']).toEqual([]);
        expect(volumes['ap-south-1']).toBeUndefined();
        expect(volumes['me-south-1']).toBeUndefined();
        expect(volumes['sa-east-1'].map((v) => v.VolumeId)).toEqual(['vol-sa']);
        expect(volumeCalls.filter((r) => r === 'sa-east-1').length).toBeGreaterThan(4);
    });

    it('does not let one unreadable region collapse snapshot inventory for the rest', async () => {
        ec2Mock.on(DescribeRegionsCommand).resolves({ Regions: enabledRegions });
        ec2Mock.on(DescribeSnapshotsCommand).callsFake(async (_input, getClient) => {
            const client = getClient ? getClient() : undefined;
            const region =
                (typeof client?.config?.region === 'function'
                    ? await client.config.region()
                    : client?.config?.region) || 'unknown';
            if (region === 'ap-northeast-2') {
                throw awsError('UnauthorizedOperation', 403);
            }
            if (region === 'eu-west-1') {
                return { Snapshots: [] };
            }
            return { Snapshots: [{ SnapshotId: `snap-${region}`, VolumeSize: 8 }] };
        });

        const snapshots = await getAllSnapshots(creds, []);

        expect(Object.keys(snapshots).sort()).toEqual(
            ['ap-south-1', 'eu-central-1', 'eu-west-1', 'sa-east-1', 'us-east-1'].sort(),
        );
        expect(snapshots['eu-west-1']).toEqual([]);
        expect(snapshots['ap-northeast-2']).toBeUndefined();
        expect(snapshots['us-east-1'][0].SnapshotId).toBe('snap-us-east-1');
    });

    it('pages through a region instead of stopping at the first token', async () => {
        ec2Mock.on(DescribeRegionsCommand).resolves({
            Regions: [{ RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' }],
        });
        ec2Mock
            .on(DescribeVolumesCommand)
            .resolvesOnce({ Volumes: [{ VolumeId: 'vol-a' }], NextToken: 'page-2' })
            .resolvesOnce({ Volumes: [{ VolumeId: 'vol-b' }], NextToken: 'page-3' })
            .resolves({ Volumes: [{ VolumeId: 'vol-c' }] });

        const volumes = await getAllVolumes(creds, []);
        expect(volumes['us-east-1'].map((v) => v.VolumeId)).toEqual(['vol-a', 'vol-b', 'vol-c']);
    });
});
