import { getAllVolumes, getAllSnapshots } from './src/utils/aws/awsEc2';

async function main() {
    const creds = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
    console.log('=== VOLUMES ===');
    const volumes = await getAllVolumes(creds);
    console.log(Object.keys(volumes).sort());
    for (const [region, items] of Object.entries(volumes)) {
        console.log(region, 'count', items.length);
    }
    console.log('=== SNAPSHOTS ===');
    const snapshots = await getAllSnapshots(creds);
    console.log(Object.keys(snapshots).sort());
    for (const [region, items] of Object.entries(snapshots)) {
        console.log(region, 'count', items.length);
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
