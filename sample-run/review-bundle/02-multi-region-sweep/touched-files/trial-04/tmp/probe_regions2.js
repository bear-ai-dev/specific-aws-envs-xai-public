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

async function probe(region, label, cmd) {
  try {
    const res = await client(region).send(cmd);
    const items = res.Volumes || res.Snapshots || [];
    console.log(`  ${label}: OK count=${items.length}`);
    for (const it of items) {
      console.log('    id=', it.VolumeId || it.SnapshotId, 'size=', it.Size || it.VolumeSize, 'az=', it.AvailabilityZone, 'tags=', JSON.stringify(it.Tags||[]));
    }
  } catch (e) {
    console.log(`  ${label}: ERR name=${e.name} code=${e.Code||e.code} status=${e.$metadata?.httpStatusCode} msg=${e.message}`);
  }
}

async function main() {
  const all = await client('us-east-1').send(new DescribeRegionsCommand({ AllRegions: true }));
  for (const r of all.Regions) {
    console.log('========', r.RegionName, r.OptInStatus, '========');
    await probe(r.RegionName, 'VOLUMES', new DescribeVolumesCommand({}));
    await probe(r.RegionName, 'SNAPSHOTS', new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
  }
}
main().catch(e => console.error(e));
