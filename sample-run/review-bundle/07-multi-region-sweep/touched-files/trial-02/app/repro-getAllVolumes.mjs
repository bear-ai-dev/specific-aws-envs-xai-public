import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

const { getAllVolumes, getAllSnapshots } = await import('./src/utils/aws/awsEc2.ts');

const creds = fromTemporaryCredentials({
  params: {
    RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
    ExternalId: 'orchard-sbx-4f21',
    RoleSessionName: 'repro',
  },
  clientConfig: { region: 'us-east-1' },
});

const filter = [{ Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] }];

console.log('=== CURRENT getAllVolumes (filtered) ===');
try {
  const volumes = await getAllVolumes(creds, filter);
  for (const [region, list] of Object.entries(volumes)) {
    console.log(region, list.length, list.map(v => v.VolumeId));
  }
  console.log('regions returned:', Object.keys(volumes).sort());
} catch (e) {
  console.log('THREW', e.name, e.message);
}

console.log('=== CURRENT getAllVolumes (unfiltered) ===');
try {
  const volumes = await getAllVolumes(creds, []);
  for (const [region, list] of Object.entries(volumes)) {
    console.log(region, list.length, list.map(v => v.VolumeId));
  }
  console.log('regions returned:', Object.keys(volumes).sort());
} catch (e) {
  console.log('THREW', e.name, e.message);
}
