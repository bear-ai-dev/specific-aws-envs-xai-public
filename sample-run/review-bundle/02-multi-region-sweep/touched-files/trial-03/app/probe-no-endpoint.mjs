import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');

async function main() {
  console.log('AWS_ENDPOINT_URL', process.env.AWS_ENDPOINT_URL);
  const client = new EC2Client({ region: 'us-east-1' });
  try {
    const regions = await client.send(new DescribeRegionsCommand({}));
    console.log('regions without explicit endpoint', regions.Regions.map(r => r.RegionName));
  } catch (e) {
    console.log('error without explicit endpoint', e.name, e.message);
  }

  const client2 = new EC2Client({});
  try {
    const regions = await client2.send(new DescribeRegionsCommand({}));
    console.log('regions default client', regions.Regions.map(r => r.RegionName));
  } catch (e) {
    console.log('error default client', e.name, e.message);
  }
}
main();
