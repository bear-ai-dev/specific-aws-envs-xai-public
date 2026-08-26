import { EC2Client, DescribeVolumesCommand, CreateVolumeCommand, DescribeSnapshotsCommand } from '@aws-sdk/client-ec2';

// try various filters / snapshot listing
for (const r of ['us-east-1','eu-west-1','eu-central-1','ap-northeast-2','sa-east-1']) {
  const client = new EC2Client({ region: r, maxAttempts: 1 });
  for (let i = 0; i < 3; i++) {
    try {
      const vols = await client.send(new DescribeVolumesCommand({}));
      console.log(r, 'vols', vols.Volumes?.length, vols.Volumes);
      break;
    } catch (e) {
      console.log(r, 'retryable?', e.name, e.message);
      await new Promise(x => setTimeout(x, 150));
    }
  }
  try {
    const snaps = await client.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
    console.log(r, 'snaps', snaps.Snapshots?.length);
  } catch (e) {
    console.log(r, 'snap err', e.name, e.message);
  }
}
