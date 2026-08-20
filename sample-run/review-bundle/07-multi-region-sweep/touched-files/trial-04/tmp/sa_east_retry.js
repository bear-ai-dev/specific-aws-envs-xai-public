const { EC2Client, DescribeVolumesCommand, DescribeSnapshotsCommand } = require('@aws-sdk/client-ec2');

function client() {
  return new EC2Client({
    region: 'sa-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL,
    maxAttempts: 1,
  });
}

async function main() {
  for (let i=1;i<=15;i++) {
    try {
      const res = await client().send(new DescribeVolumesCommand({}));
      console.log('attempt', i, 'OK', (res.Volumes||[]).length);
    } catch(e) {
      console.log('attempt', i, 'FAIL', e.Code, e.message);
    }
    await new Promise(r=>setTimeout(r, 50));
  }
}
main();
