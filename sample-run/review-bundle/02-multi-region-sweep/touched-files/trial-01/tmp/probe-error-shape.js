const { EC2Client, DescribeVolumesCommand } = require('/app/node_modules/@aws-sdk/client-ec2');

(async () => {
  const client = new EC2Client({
    region: 'ap-south-1',
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    endpoint: process.env.AWS_ENDPOINT_URL,
    maxAttempts: 1,
  });
  try {
    await client.send(new DescribeVolumesCommand({}));
  } catch (e) {
    console.log('keys', Object.keys(e));
    console.log('name', e.name);
    console.log('code', e.code);
    console.log('Code', e.Code);
    console.log('message', e.message);
    console.log('fault', e.$fault);
    console.log('retryable', e.$retryable);
    console.log('metadata', e.$metadata);
    console.log('constructor', e.constructor?.name);
  }
})();
