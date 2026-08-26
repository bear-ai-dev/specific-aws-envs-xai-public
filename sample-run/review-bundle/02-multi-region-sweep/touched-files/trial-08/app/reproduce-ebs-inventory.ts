import { getAllVolumes, getAllSnapshots } from './src/utils/aws/awsEc2';

(async () => {
    const volumes = await getAllVolumes(undefined as any, []);
    const snapshots = await getAllSnapshots(undefined as any, []);
    console.log('VOLUME KEYS', Object.keys(volumes).sort());
    console.log('SNAPSHOT KEYS', Object.keys(snapshots).sort());
    console.log('VOLUME COUNTS', Object.fromEntries(Object.entries(volumes).map(([k,v]) => [k, (v as any[]).length])));
    console.log('SNAPSHOT COUNTS', Object.fromEntries(Object.entries(snapshots).map(([k,v]) => [k, (v as any[]).length])));
})().catch((e) => {
    console.error('FAILED', e);
    process.exit(1);
});
