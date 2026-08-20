const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand } = require('@aws-sdk/client-ec2');

const creds = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

function client(region, maxAttempts=3) {
  return new EC2Client({
    region,
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials: creds,
    maxAttempts,
  });
}

async function probe(region, label, cmd, attempts=3) {
  for (let i=1;i<=attempts;i++) {
    try {
      const res = await client(region, 1).send(cmd);
      const items = res.Volumes || res.Snapshots || [];
      console.log(`  ${label}: OK attempt=${i} count=${items.length}`);
      for (const it of items) {
        console.log('    id=', it.VolumeId || it.SnapshotId, 'size=', it.Size || it.VolumeSize, 'az=', it.AvailabilityZone, 'type=', it.VolumeType, 'state=', it.State, 'tags=', JSON.stringify(it.Tags||[]));
      }
      return;
    } catch (e) {
      console.log(`  ${label}: ERR attempt=${i} name=${e.name} code=${e.Code||e.code} status=${e.$metadata?.httpStatusCode} msg=${e.message}`);
    }
  }
}

async function main() {
  const all = await client('us-east-1').send(new DescribeRegionsCommand({ AllRegions: true }));
  for (const r of all.Regions) {
    console.log('========', r.RegionName, r.OptInStatus, '========');
    await probe(r.RegionName, 'VOLUMES', new DescribeVolumesCommand({}));
    await probe(r.RegionName, 'SNAPSHOTS', new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
  }

  console.log('\n===== RETRY sa-east-1 more times =====');
  for (let i=1;i<=8;i++) {
    try {
      const res = await client('sa-east-1', 1).send(new DescribeVolumesCommand({}));
      console.log('sa-east-1 volumes attempt', i, 'OK', (res.Volumes||[]).length);
      console.log(JSON.stringify(res.Volumes, null, 2).slice(0,3000));
      break;
    } catch(e) {
      console.log('sa-east-1 volumes attempt', i, e.name, e.message);
      await new Promise(r=>setTimeout(r, 200));
    }
  }
}
main().catch(e => console.error(e));
