import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');

const endpoint = process.env.AWS_ENDPOINT_URL;
console.log('endpoint', endpoint);
console.log('region', process.env.AWS_REGION);
console.log('accessKey', process.env.AWS_ACCESS_KEY_ID);

const client = new EC2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function main() {
  try {
    const regions = await client.send(new DescribeRegionsCommand({}));
    console.log('DEFAULT REGIONS', JSON.stringify(regions.Regions, null, 2));
  } catch (e) {
    console.log('DEFAULT REGIONS ERROR', e.name, e.message, e.Code);
    console.log(JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 3000));
  }

  try {
    const allRegions = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
    console.log('ALL REGIONS', JSON.stringify(allRegions.Regions, null, 2));
  } catch (e) {
    console.log('ALL REGIONS ERROR', e.name, e.message);
  }

  try {
    const vols = await client.send(new DescribeVolumesCommand({}));
    console.log('VOLUMES us-east-1', JSON.stringify(vols.Volumes, null, 2));
  } catch (e) {
    console.log('VOLUMES ERROR', e.name, e.message);
  }
}

main();
