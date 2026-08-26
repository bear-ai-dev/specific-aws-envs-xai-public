import { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';

const endpoint = process.env.AWS_ENDPOINT_URL;
console.log('endpoint', endpoint);
console.log('region', process.env.AWS_REGION);
console.log('key', process.env.AWS_ACCESS_KEY_ID);

const client = new EC2Client({ region: 'us-east-1' });
try {
  const regions = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
  console.log('ALL REGIONS:', JSON.stringify(regions.Regions, null, 2));
} catch (e) {
  console.log('DescribeRegions AllRegions error:', e.name, e.message, e.Code, e.$metadata);
}

try {
  const regions2 = await client.send(new DescribeRegionsCommand({}));
  console.log('ENABLED REGIONS:', JSON.stringify(regions2.Regions, null, 2));
} catch (e) {
  console.log('DescribeRegions default error:', e.name, e.message, e.Code, e.$metadata);
}

try {
  const vols = await client.send(new DescribeVolumesCommand({}));
  console.log('VOLUMES us-east-1:', JSON.stringify(vols.Volumes, null, 2));
} catch (e) {
  console.log('DescribeVolumes error:', e.name, e.message, e.Code);
}
