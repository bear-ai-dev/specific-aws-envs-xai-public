import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getAllVolumes, getAllSnapshots } from './src/utils/aws/awsEc2';

async function main() {
    const creds = fromTemporaryCredentials({
        params: {
            RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
            ExternalId: 'orchard-sbx-4f21',
            RoleSessionName: 'repro',
        },
        clientConfig: { region: 'us-east-1' },
    });

    const filter = [{ Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] }];

    console.log('=== getAllVolumes (filtered) ===');
    const volumes = await getAllVolumes(creds, filter);
    for (const region of Object.keys(volumes).sort()) {
        console.log(
            region,
            volumes[region].length,
            volumes[region].map((v) => v.VolumeId),
        );
    }
    console.log('volume regions:', Object.keys(volumes).sort());

    console.log('=== getAllVolumes (unfiltered) ===');
    const allVolumes = await getAllVolumes(creds, []);
    for (const region of Object.keys(allVolumes).sort()) {
        console.log(
            region,
            allVolumes[region].length,
            allVolumes[region].map((v) => v.VolumeId),
        );
    }
    console.log('unfiltered volume regions:', Object.keys(allVolumes).sort());

    console.log('=== getAllSnapshots (filtered) ===');
    const snapshots = await getAllSnapshots(creds, filter);
    for (const region of Object.keys(snapshots).sort()) {
        console.log(
            region,
            snapshots[region].length,
            snapshots[region].map((s) => s.SnapshotId),
        );
    }
    console.log('snapshot regions:', Object.keys(snapshots).sort());
}

main().catch((err) => {
    console.error('FAILED', err);
    process.exit(1);
});
