import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getAllVolumes, getAllSnapshots } from './src/utils/aws/awsEc2';

async function main() {
    const creds = fromTemporaryCredentials({
        params: {
            RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
            ExternalId: 'orchard-sbx-4f21',
            RoleSessionName: 'verify',
        },
        clientConfig: { region: 'us-east-1' },
    });
    const filter = [{ Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] }];
    const volumes = await getAllVolumes(creds, filter);
    const snapshots = await getAllSnapshots(creds, filter);
    const volumeRegions = Object.keys(volumes).sort();
    const snapshotRegions = Object.keys(snapshots).sort();
    console.log('volume regions', volumeRegions);
    console.log('snapshot regions', snapshotRegions);
    const expectedVolumes = ['ap-northeast-2', 'eu-central-1', 'eu-west-1', 'sa-east-1', 'us-east-1'];
    const expectedSnapshots = ['ap-south-1', 'eu-central-1', 'eu-west-1', 'sa-east-1', 'us-east-1'];
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (!same(volumeRegions, expectedVolumes)) {
        throw new Error(`unexpected volume regions ${volumeRegions}`);
    }
    if (!same(snapshotRegions, expectedSnapshots)) {
        throw new Error(`unexpected snapshot regions ${snapshotRegions}`);
    }
    if (volumeRegions.includes('me-south-1') || snapshotRegions.includes('me-south-1')) {
        throw new Error('not-opted-in region leaked');
    }
    if (volumeRegions.includes('ap-south-1')) {
        throw new Error('permanently unreadable volume region leaked');
    }
    if (snapshotRegions.includes('ap-northeast-2')) {
        throw new Error('permanently unreadable snapshot region leaked');
    }
    if (volumes['eu-central-1'].length !== 0) {
        throw new Error('filtered empty readable region should still be present with zero volumes');
    }
    if (snapshots['eu-west-1'].length !== 0) {
        throw new Error('filtered empty readable region should still be present with zero snapshots');
    }
    if (volumes['sa-east-1'].length !== 2) {
        throw new Error('rate-limited volume region did not recover');
    }
    if (snapshots['sa-east-1'].length !== 2) {
        throw new Error('rate-limited snapshot region did not recover');
    }
    console.log('ALL CHECKS PASSED');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
