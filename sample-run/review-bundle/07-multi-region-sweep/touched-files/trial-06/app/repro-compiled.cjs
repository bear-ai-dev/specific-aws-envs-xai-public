const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { getAllVolumes, getAllSnapshots, getEnabledRegions } = require('/tmp/awsec2-out/awsEc2.js');

const ROLE = 'arn:aws:iam::100000000077:role/meteringco-metering';
const EXTERNAL_ID = 'orchard-sbx-4f21';

async function assume() {
    const sts = new STSClient({ region: 'us-east-1' });
    const assumed = await sts.send(
        new AssumeRoleCommand({
            RoleArn: ROLE,
            RoleSessionName: 'reproduce-ebs',
            ExternalId: EXTERNAL_ID,
        }),
    );
    return {
        accessKeyId: assumed.Credentials.AccessKeyId,
        secretAccessKey: assumed.Credentials.SecretAccessKey,
        sessionToken: assumed.Credentials.SessionToken,
    };
}

function summarize(label, byRegion) {
    const keys = Object.keys(byRegion).sort();
    console.log(`\n=== ${label} regions (${keys.length}) ===`);
    for (const r of keys) {
        const items = byRegion[r] || [];
        const ids = items.map((i) => i.VolumeId || i.SnapshotId);
        console.log(`  ${r}: ${items.length} -> ${ids.join(',') || '(empty)'}`);
    }
}

(async () => {
    const creds = await assume();
    console.log('enabled', await getEnabledRegions(creds));

    const volumes = await getAllVolumes(creds, [
        { Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] },
    ]);
    summarize('VOLUMES filtered', volumes);

    const volumesAll = await getAllVolumes(creds, []);
    summarize('VOLUMES unfiltered', volumesAll);

    const snaps = await getAllSnapshots(creds, [
        { Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] },
    ]);
    summarize('SNAPSHOTS filtered', snaps);

    const snapsAll = await getAllSnapshots(creds, []);
    summarize('SNAPSHOTS unfiltered', snapsAll);
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
