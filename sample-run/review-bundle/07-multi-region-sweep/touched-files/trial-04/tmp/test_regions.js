const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand } = require('@aws-sdk/client-ec2');

async function main() {
  const client = new EC2Client({
    region: 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  try {
    console.log('=== DescribeRegions AllRegions=true ===');
    const all = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
    console.log(JSON.stringify(all.Regions, null, 2));
  } catch (e) {
    console.log('AllRegions error:', e.name, e.message, e.Code, e.$metadata);
  }

  try {
    console.log('=== DescribeRegions default ===');
    const def = await client.send(new DescribeRegionsCommand({}));
    console.log(JSON.stringify(def.Regions, null, 2));
  } catch (e) {
    console.log('Default error:', e.name, e.message);
  }

  try {
    console.log('=== DescribeVolumes us-east-1 ===');
    const vols = await client.send(new DescribeVolumesCommand({}));
    console.log(JSON.stringify(vols.Volumes, null, 2));
  } catch (e) {
    console.log('Volumes error:', e.name, e.message);
  }
}
main().catch(e => console.error('fatal', e));
