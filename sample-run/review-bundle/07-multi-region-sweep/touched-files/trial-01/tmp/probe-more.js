const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeAvailabilityZonesCommand, DescribeAccountAttributesCommand } = require('/app/node_modules/@aws-sdk/client-ec2');

async function call(region, cmd, name) {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
    maxAttempts: 4,
  });
  try {
    const r = await client.send(cmd);
    console.log(name, region, 'OK', JSON.stringify(r, (k,v)=> k==='$metadata'?undefined:v).slice(0,1500));
  } catch (e) {
    console.log(name, region, 'ERR', e.name, e.message, e.$metadata?.httpStatusCode);
  }
}

(async () => {
  await call('us-east-1', new DescribeAccountAttributesCommand({}), 'DescribeAccountAttributes');
  await call('us-east-1', new DescribeAvailabilityZonesCommand({ AllAvailabilityZones: true }), 'DescribeAZs');
  // try filters empty vs none
  await call('us-east-1', new DescribeVolumesCommand({ MaxResults: 100 }), 'DescribeVolumes max');
  await call('us-east-1', new DescribeVolumesCommand({ Filters: [] }), 'DescribeVolumes empty filters');
  // try us-west-2 more thoroughly
  for (const region of ['us-west-1','us-west-2','us-east-2','eu-north-1','ap-northeast-1','af-south-1','ap-east-1']) {
    await call(region, new DescribeVolumesCommand({}), 'DescribeVolumes');
    await call(region, new DescribeRegionsCommand({ AllRegions: true }), 'DescribeRegions');
  }
})();
