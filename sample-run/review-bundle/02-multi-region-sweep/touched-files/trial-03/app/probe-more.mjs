import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand, DescribeAvailabilityZonesCommand } = require('@aws-sdk/client-ec2');

const endpoint = process.env.AWS_ENDPOINT_URL;
const creds = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendRetry(client, cmd, label, max=6) {
  for (let i=1;i<=max;i++) {
    try {
      return await client.send(cmd);
    } catch (e) {
      console.log(`ERR ${label} attempt=${i} ${e.name} ${e.Code} ${e.message}`);
      if (e.Code === 'RequestLimitExceeded' || e.name === 'RequestLimitExceeded') {
        await sleep(150*i);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  // Try without endpoint to see default SDK behavior
  // Probe STS account
  try {
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const sts = new STSClient({ region: 'us-east-1', endpoint, credentials: creds });
    const id = await sts.send(new GetCallerIdentityCommand({}));
    console.log('identity', id);
  } catch (e) {
    console.log('sts err', e.name, e.message);
  }

  const client = new EC2Client({ region: 'us-east-1', endpoint, credentials: creds, maxAttempts: 1 });
  const all = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
  console.log('all', all.Regions);

  for (const r of all.Regions) {
    const c = new EC2Client({ region: r.RegionName, endpoint, credentials: creds, maxAttempts: 1 });
    try {
      const az = await sendRetry(c, new DescribeAvailabilityZonesCommand({}), `az ${r.RegionName}`);
      console.log('AZ', r.RegionName, az.AvailabilityZones?.map(z => z.ZoneName));
    } catch (e) {
      console.log('AZ fail', r.RegionName, e.name, e.message);
    }
    try {
      const vols = await sendRetry(c, new DescribeVolumesCommand({}), `vol ${r.RegionName}`);
      console.log('VOL', r.RegionName, vols.Volumes);
    } catch (e) {
      console.log('VOL fail', r.RegionName, e.name, e.message);
    }
    try {
      const snaps = await sendRetry(c, new DescribeSnapshotsCommand({ OwnerIds: ['self'] }), `snap ${r.RegionName}`);
      console.log('SNAP', r.RegionName, snaps.Snapshots);
    } catch (e) {
      console.log('SNAP fail', r.RegionName, e.name, e.message);
    }
  }
}
main();
