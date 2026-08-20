const { fromTemporaryCredentials } = require('@aws-sdk/credential-providers');
const { getAllVolumes, getAllSnapshots } = require('./.tmp-out/awsEc2.js');

const creds = fromTemporaryCredentials({
    params: {
        RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
        ExternalId: 'orchard-sbx-4f21',
        RoleSessionName: 'repro',
    },
    clientConfig: { region: 'us-east-1' },
});

const filters = [{ Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] }];

async function dump(label, result) {
    console.log(`=== ${label} ===`);
    const regions = Object.keys(result).sort();
    console.log('regions:', regions.join(','));
    for (const region of regions) {
        const items = result[region] || [];
        const ids = items.map((item) => item.VolumeId || item.SnapshotId).join(',');
        console.log(`${region} count=${items.length} ids=${ids}`);
    }
}

(async () => {
    try {
        const volumes = await getAllVolumes(creds, filters);
        dump('VOLUMES filtered', volumes);
    } catch (err) {
        console.log('getAllVolumes THREW', err.name, err.message);
    }
    try {
        const snapshots = await getAllSnapshots(creds, filters);
        dump('SNAPSHOTS filtered', snapshots);
    } catch (err) {
        console.log('getAllSnapshots THREW', err.name, err.message);
    }
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
