const { EC2Client, CreateVolumeCommand, DescribeVolumesCommand, CreateSnapshotCommand, DescribeSnapshotsCommand } = require('@aws-sdk/client-ec2');

const client = new EC2Client({
  region: 'eu-west-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
});

async function main() {
  try {
    const vol = await client.send(new CreateVolumeCommand({
      AvailabilityZone: 'eu-west-1a',
      Size: 10,
      VolumeType: 'gp3',
    }));
    console.log('created volume', vol.VolumeId, vol);
  } catch(e) {
    console.log('create volume fail', e.name, e.message);
  }
}
main();
