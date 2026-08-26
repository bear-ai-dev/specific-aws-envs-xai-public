const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('/app/node_modules/@aws-sdk/client-ec2');

async function tryClient(opts, label) {
  console.log('\n====', label, '====');
  const client = new EC2Client(opts);
  try {
    const r = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
    console.log('DescribeRegions AllRegions=true:', JSON.stringify(r.Regions, null, 2));
  } catch (e) {
    console.log('DescribeRegions AllRegions=true ERROR:', e.name, e.message, e.$metadata?.httpStatusCode, e.Code || e.code);
  }
  try {
    const r = await client.send(new DescribeRegionsCommand({}));
    console.log('DescribeRegions default:', JSON.stringify(r.Regions, null, 2));
  } catch (e) {
    console.log('DescribeRegions default ERROR:', e.name, e.message, e.$metadata?.httpStatusCode, e.Code || e.code);
  }
  try {
    const r = await client.send(new DescribeVolumesCommand({}));
    console.log('DescribeVolumes:', JSON.stringify((r.Volumes||[]).map(v => ({id:v.VolumeId, az:v.AvailabilityZone, size:v.Size})), null, 2), 'count', r.Volumes?.length);
  } catch (e) {
    console.log('DescribeVolumes ERROR:', e.name, e.message, e.$metadata?.httpStatusCode, e.Code || e.code);
  }
}

(async () => {
  const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
  const endpoint = process.env.AWS_ENDPOINT_URL;
  console.log('ENV', { AWS_ENDPOINT_URL: endpoint, AWS_REGION: process.env.AWS_REGION, AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID });
  await tryClient({ region: 'us-east-1', credentials: creds, endpoint }, 'endpoint + us-east-1');
})();
