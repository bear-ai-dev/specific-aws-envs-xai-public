const { EC2Client, DescribeVolumesCommand, DescribeSnapshotsCommand } = require('/app/node_modules/@aws-sdk/client-ec2');

async function describeVolumes(region, n=8) {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
    maxAttempts: 1,
  });
  for (let i=0;i<n;i++) {
    try {
      const r = await client.send(new DescribeVolumesCommand({}));
      console.log(region, 'try', i, 'ok', (r.Volumes||[]).length, JSON.stringify((r.Volumes||[]).map(v=>({id:v.VolumeId,az:v.AvailabilityZone,size:v.Size,type:v.VolumeType,tags:v.Tags,state:v.State}))));
    } catch (e) {
      console.log(region, 'try', i, 'ERR', e.name, e.message, e.$metadata?.httpStatusCode, 'retryable', JSON.stringify(e.$retryable));
    }
  }
}

(async () => {
  await describeVolumes('sa-east-1', 10);
  console.log('--- us-east-1 again ---');
  await describeVolumes('us-east-1', 1);
  console.log('--- ap-south-1 again ---');
  await describeVolumes('ap-south-1', 2);
})();
