const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');

async function main() {
  console.log('AWS_ENDPOINT_URL', process.env.AWS_ENDPOINT_URL);
  const c1 = new EC2Client({ region: 'us-east-1' });
  try {
    const r = await c1.send(new DescribeRegionsCommand({}));
    console.log('no-explicit-endpoint regions', r.Regions.map(x=>x.RegionName));
  } catch(e) {
    console.log('no-explicit-endpoint FAIL', e.name, e.message);
  }

  const c2 = new EC2Client({ region: 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL });
  const r2 = await c2.send(new DescribeRegionsCommand({}));
  console.log('explicit-endpoint regions', r2.Regions.map(x=>x.RegionName));
}
main().catch(console.error);
