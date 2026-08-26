import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');

const endpoint = process.env.AWS_ENDPOINT_URL;
const creds = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

async function probe(region) {
  const client = new EC2Client({
    region,
    endpoint,
    credentials: creds,
    maxAttempts: 1,
  });
  try {
    const vols = await client.send(new DescribeVolumesCommand({}));
    console.log(`OK ${region} count=${vols.Volumes?.length ?? 0} ids=${(vols.Volumes||[]).map(v => v.VolumeId).join(',')}`);
    if (vols.Volumes?.length) {
      for (const v of vols.Volumes) {
        console.log(`  vol ${v.VolumeId} size=${v.Size} type=${v.VolumeType} az=${v.AvailabilityZone} tags=${JSON.stringify(v.Tags)}`);
      }
    }
  } catch (e) {
    console.log(`ERR ${region} name=${e.name} code=${e.Code || e.code} status=${e.$metadata?.httpStatusCode} message=${e.message}`);
    console.log(`  extra: RequestId=${e.$metadata?.requestId} retryable=${e.$retryable} fault=${e.$fault}`);
  }
}

async function main() {
  const client = new EC2Client({ region: 'us-east-1', endpoint, credentials: creds });
  const def = await client.send(new DescribeRegionsCommand({}));
  const all = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
  console.log('default region names', def.Regions.map(r => `${r.RegionName}:${r.OptInStatus}`));
  console.log('all region names', all.Regions.map(r => `${r.RegionName}:${r.OptInStatus}`));

  const regions = all.Regions.map(r => r.RegionName);
  // also try a couple extra
  for (const extra of ['us-west-2', 'us-west-1', 'eu-north-1', 'ap-southeast-1']) {
    if (!regions.includes(extra)) regions.push(extra);
  }
  for (const r of regions) {
    await probe(r);
    // retry once to see if rate-limit is transient
    await probe(r);
    console.log('---');
  }
}

main();
