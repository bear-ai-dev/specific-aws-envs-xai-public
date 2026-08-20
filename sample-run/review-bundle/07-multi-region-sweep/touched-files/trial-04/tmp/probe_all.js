const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand } = require('@aws-sdk/client-ec2');

const creds = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

function client(region) {
  return new EC2Client({
    region,
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials: creds,
    maxAttempts: 1,
  });
}

async function withRetry(fn, n=10) {
  let last;
  for (let i=1;i<=n;i++) {
    try { return await fn(); }
    catch(e) {
      last = e;
      const code = e.Code || e.code || e.name;
      console.log('  retry', i, code, e.message);
      if (code !== 'RequestLimitExceeded' && code !== 'Throttling' && code !== 'TooManyRequestsException') throw e;
      await new Promise(r=>setTimeout(r, 150*i));
    }
  }
  throw last;
}

async function main() {
  const def = await client('us-east-1').send(new DescribeRegionsCommand({}));
  console.log('ENABLED REGIONS', def.Regions.map(r=>r.RegionName));

  for (const r of def.Regions) {
    console.log('\n====', r.RegionName, '====');
    try {
      const vols = await withRetry(() => client(r.RegionName).send(new DescribeVolumesCommand({})));
      console.log('VOLUMES', (vols.Volumes||[]).length);
      console.log(JSON.stringify(vols.Volumes, null, 2));
    } catch(e) {
      console.log('VOLUMES FAIL', e.name, e.Code, e.message);
    }
    try {
      const snaps = await withRetry(() => client(r.RegionName).send(new DescribeSnapshotsCommand({ OwnerIds: ['self'] })));
      console.log('SNAPSHOTS', (snaps.Snapshots||[]).length);
      console.log(JSON.stringify(snaps.Snapshots, null, 2));
    } catch(e) {
      console.log('SNAPSHOTS FAIL', e.name, e.Code, e.message);
    }
  }
}
main().catch(e => console.error(e));
