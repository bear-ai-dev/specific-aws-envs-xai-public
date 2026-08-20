const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('/app/node_modules/@aws-sdk/client-ec2');

(async () => {
  const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
  // no endpoint
  const client = new EC2Client({ region: 'us-east-1', credentials: creds });
  try {
    const r = await client.send(new DescribeRegionsCommand({}));
    console.log('NO ENDPOINT regions', (r.Regions||[]).map(x=>x.RegionName));
  } catch (e) {
    console.log('NO ENDPOINT ERROR', e.name, e.message.slice(0,200));
  }

  // default credential provider
  const client2 = new EC2Client({ region: 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL });
  try {
    const r = await client2.send(new DescribeRegionsCommand({ AllRegions: true }));
    console.log('DEFAULT CREDS + ENDPOINT', (r.Regions||[]).map(x=>[x.RegionName,x.OptInStatus]));
  } catch (e) {
    console.log('DEFAULT CREDS ERROR', e.name, e.message.slice(0,200));
  }
})();
