const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand, paginateDescribeVolumes } = require('/app/node_modules/@aws-sdk/client-ec2');

async function listAll(region) {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
    maxAttempts: 3,
  });
  try {
    const volumes = [];
    let next;
    do {
      const r = await client.send(new DescribeVolumesCommand({ NextToken: next, MaxResults: 5 }));
      next = r.NextToken;
      volumes.push(...(r.Volumes||[]));
      console.log(region, 'page', (r.Volumes||[]).length, 'next', !!next);
    } while (next);
    return volumes;
  } catch (e) {
    console.log(region, 'ERR', e.name, e.message);
    return null;
  }
}

(async () => {
  const client = new EC2Client({
    region: 'us-east-1',
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
  });
  const r = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
  console.log('ALL REGIONS', r.Regions.map(x => [x.RegionName, x.OptInStatus]));
  const r2 = await client.send(new DescribeRegionsCommand({ Filters: [{Name:'opt-in-status', Values:['opt-in-not-required','opted-in']}] }));
  console.log('FILTERED', (r2.Regions||[]).map(x => [x.RegionName, x.OptInStatus]));

  for (const region of r.Regions.map(x=>x.RegionName)) {
    const vols = await listAll(region);
    if (vols) console.log(region, 'TOTAL', vols.length, JSON.stringify(vols.map(v=>({id:v.VolumeId,az:v.AvailabilityZone,size:v.Size,type:v.VolumeType,tags:v.Tags}))));
  }
})();
