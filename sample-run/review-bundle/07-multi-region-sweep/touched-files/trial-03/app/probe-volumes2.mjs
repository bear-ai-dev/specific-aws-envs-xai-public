import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');

const endpoint = process.env.AWS_ENDPOINT_URL;
const creds = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function probeWithRetry(region, maxRetries = 5) {
  for (let i = 1; i <= maxRetries; i++) {
    const client = new EC2Client({
      region,
      endpoint,
      credentials: creds,
      maxAttempts: 1,
    });
    try {
      const vols = await client.send(new DescribeVolumesCommand({}));
      console.log(`OK ${region} attempt=${i} count=${vols.Volumes?.length ?? 0}`);
      if (vols.Volumes?.length) {
        for (const v of vols.Volumes) {
          console.log(`  vol ${v.VolumeId} size=${v.Size} type=${v.VolumeType} az=${v.AvailabilityZone} state=${v.State} tags=${JSON.stringify(v.Tags)}`);
        }
      }
      return;
    } catch (e) {
      console.log(`ERR ${region} attempt=${i} name=${e.name} code=${e.Code || e.code} status=${e.$metadata?.httpStatusCode} message=${e.message}`);
      if (e.Code === 'RequestLimitExceeded' || e.name === 'RequestLimitExceeded') {
        await sleep(200 * i);
        continue;
      }
      return;
    }
  }
}

async function main() {
  const client = new EC2Client({ region: 'us-east-1', endpoint, credentials: creds });
  const def = await client.send(new DescribeRegionsCommand({ AllRegions: false }));
  console.log('enabled', def.Regions.map(r => `${r.RegionName}:${r.OptInStatus}`));

  for (const r of def.Regions.map(x => x.RegionName)) {
    await probeWithRetry(r, 8);
  }
}

main();
