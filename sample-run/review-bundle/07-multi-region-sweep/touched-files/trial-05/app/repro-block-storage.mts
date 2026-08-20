import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getAllVolumes, getAllSnapshots } from './src/utils/aws/awsEc2.ts';

const creds = fromTemporaryCredentials({
    params: {
        RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
        ExternalId: 'orchard-sbx-4f21',
        RoleSessionName: 'repro',
    },
    clientConfig: { region: 'us-east-1' },
});

const filters = [{ Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] }];

async function main() {
    console.log('=== VOLUMES (filtered) ===');
    try {
        const volumes = await getAllVolumes(creds, filters);
        for (const [region, list] of Object.entries(volumes).sort()) {
            console.log(region, 'count=', list.length, 'ids=', list.map((v: any) => v.VolumeId).join(','));
        }
        console.log('volume regions:', Object.keys(volumes).sort().join(','));
    } catch (err: any) {
        console.log('getAllVolumes THREW', err?.name || err?.Code, err?.message);
    }

    console.log('=== SNAPSHOTS (filtered) ===');
    try {
        const snapshots = await getAllSnapshots(creds, filters);
        for (const [region, list] of Object.entries(snapshots).sort()) {
            console.log(region, 'count=', list.length, 'ids=', list.map((s: any) => s.SnapshotId).join(','));
        }
        console.log('snapshot regions:', Object.keys(snapshots).sort().join(','));
    } catch (err: any) {
        console.log('getAllSnapshots THREW', err?.name || err?.Code, err?.message);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
