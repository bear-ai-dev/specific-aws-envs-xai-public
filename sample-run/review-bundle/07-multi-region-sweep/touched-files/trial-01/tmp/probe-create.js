const { EC2Client, DescribeVolumesCommand, CreateVolumeCommand, DescribeSnapshotsCommand, DescribeInstancesCommand } = require('/app/node_modules/@aws-sdk/client-ec2');

async function call(region, cmd, name) {
  const client = new EC2Client({
    region,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
    maxAttempts: 4,
  });
  try {
    const r = await client.send(cmd);
    console.log(name, region, 'OK', JSON.stringify(r, (k,v)=> k==='$metadata'?undefined:v).slice(0,2000));
    return r;
  } catch (e) {
    console.log(name, region, 'ERR', e.name, e.message, e.$metadata?.httpStatusCode);
  }
}

(async () => {
  await call('us-east-1', new DescribeSnapshotsCommand({ OwnerIds: ['self'] }), 'DescribeSnapshots');
  await call('us-east-1', new DescribeInstancesCommand({}), 'DescribeInstances');
  // try describe volumes with all possible next tokens etc
  await call('eu-west-1', new DescribeVolumesCommand({ VolumeIds: [] }), 'DescribeVolumes empty ids');
})();
