const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

async function main() {
    require('ts-node').register({
        transpileOnly: true,
        compilerOptions: {
            module: 'commonjs',
            esModuleInterop: true,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
        },
    });
    const awsEc2 = require('./src/utils/aws/awsEc2.ts');
    console.log('exports', Object.keys(awsEc2));
    const { fromTemporaryCredentials } = require('@aws-sdk/credential-providers');
    const creds = fromTemporaryCredentials({
        params: {
            RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
            ExternalId: 'orchard-sbx-4f21',
            RoleSessionName: 'repro',
        },
        clientConfig: { region: 'us-east-1' },
    });
    const filters = [{ Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] }];
    try {
        const volumes = await awsEc2.getAllVolumes(creds, filters);
        console.log('VOLUMES regions', Object.keys(volumes));
        for (const [region, list] of Object.entries(volumes)) {
            console.log(region, list.map((v) => v.VolumeId));
        }
    } catch (e) {
        console.log('volumes threw', e.name, e.message);
    }
    try {
        const snapshots = await awsEc2.getAllSnapshots(creds, filters);
        console.log('SNAPSHOTS regions', Object.keys(snapshots));
        for (const [region, list] of Object.entries(snapshots)) {
            console.log(region, list.map((s) => s.SnapshotId));
        }
    } catch (e) {
        console.log('snapshots threw', e.name, e.message);
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
