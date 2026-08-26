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
  });
}

async function probe(region, cmdName, cmd) {
  try {
    const res = await client(region).send(cmd);
    return { ok: true, data: res };
  } catch (e) {
    return {
      ok: false,
      name: e.name,
      message: e.message,
      code: e.Code || e.code,
      httpStatus: e.$metadata?.httpStatusCode,
      fault: e.$fault,
      retryable: e.$retryable,
      error: Object.getOwnPropertyNames(e).reduce((a,k)=>{a[k]=e[k]; return a;}, {toString: String(e)}),
    };
  }
}

async function main() {
  const all = await client('us-east-1').send(new DescribeRegionsCommand({ AllRegions: true }));
  console.log('ALL REGIONS:');
  for (const r of all.Regions) {
    console.log(`  ${r.RegionName} optin=${r.OptInStatus}`);
  }

  for (const r of all.Regions) {
    console.log('\n======== REGION', r.RegionName, r.OptInStatus, '========');
    const vols = await probe(r.RegionName, 'volumes', new DescribeVolumesCommand({}));
    if (vols.ok) {
      console.log('VOLUMES count=', (vols.data.Volumes||[]).length);
      console.log(JSON.stringify(vols.data.Volumes, null, 2).slice(0, 2000));
    } else {
      console.log('VOLUMES ERROR', JSON.stringify(vols, null, 2).slice(0, 2500));
    }
    const snaps = await probe(r.RegionName, 'snapshots', new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
    if (snaps.ok) {
      console.log('SNAPSHOTS count=', (snaps.data.Snapshots||[]).length);
      console.log(JSON.stringify(snaps.data.Snapshots, null, 2).slice(0, 2000));
    } else {
      console.log('SNAPSHOTS ERROR', JSON.stringify(snaps, null, 2).slice(0, 2500));
    }
  }
}
main().catch(e => console.error(e));
