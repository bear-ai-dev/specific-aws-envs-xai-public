const { EC2Client, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');

async function show(region) {
  const client = new EC2Client({ region, endpoint: process.env.AWS_ENDPOINT_URL, maxAttempts: 1 });
  try {
    await client.send(new DescribeVolumesCommand({}));
    console.log(region, 'OK');
  } catch (e) {
    console.log('====', region, '====');
    console.log('name', e.name);
    console.log('code', e.Code, e.code);
    console.log('message', e.message);
    console.log('__type', e.__type);
    console.log('$fault', e.$fault);
    console.log('$retryable', e.$retryable);
    console.log('http', e.$metadata?.httpStatusCode);
    console.log('keys', Object.keys(e));
    console.log('own', Object.getOwnPropertyNames(e));
  }
}
(async () => {
  await show('ap-south-1');
  await show('me-south-1');
  await show('sa-east-1');
})();
