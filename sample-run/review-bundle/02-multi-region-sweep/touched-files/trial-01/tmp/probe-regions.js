const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('/app/node_modules/@aws-sdk/client-ec2');

async function describeVolumes(region) {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
  });
  try {
    const r = await client.send(new DescribeVolumesCommand({}));
    return { ok: true, count: (r.Volumes||[]).length, volumes: (r.Volumes||[]).map(v => ({id:v.VolumeId, az:v.AvailabilityZone, size:v.Size, type:v.VolumeType, tags:v.Tags})) };
  } catch (e) {
    return { ok: false, name: e.name, message: e.message, status: e.$metadata?.httpStatusCode, code: e.Code || e.code, fault: e.$fault, retryable: e.$retryable };
  }
}

(async () => {
  const client = new EC2Client({
    region: 'us-east-1',
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
  });
  const r = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
  for (const region of r.Regions) {
    console.log('\n====', region.RegionName, region.OptInStatus, '====');
    const res = await describeVolumes(region.RegionName);
    console.log(JSON.stringify(res, null, 2));
  }
  // also try a couple extra
  for (const extra of ['us-west-2', 'ap-southeast-1', 'cn-north-1']) {
    console.log('\n==== EXTRA', extra, '====');
    console.log(JSON.stringify(await describeVolumes(extra), null, 2));
  }
})();
