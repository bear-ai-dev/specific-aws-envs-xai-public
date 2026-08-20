const { EC2Client, DescribeVolumesCommand, DescribeSnapshotsCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');

function client(region, maxAttempts=1) {
  return new EC2Client({
    region,
    endpoint: process.env.AWS_ENDPOINT_URL,
    maxAttempts,
  });
}

async function main() {
  console.log('--- sequential 20 calls sa-east-1 volumes ---');
  for (let i=1;i<=20;i++) {
    try {
      const res = await client('sa-east-1', 1).send(new DescribeVolumesCommand({}));
      console.log(i, 'OK', (res.Volumes||[]).length);
    } catch(e) {
      console.log(i, 'FAIL', e.Code);
    }
  }

  console.log('--- default SDK retry maxAttempts=3 ---');
  try {
    const res = await client('sa-east-1', 3).send(new DescribeVolumesCommand({}));
    console.log('maxAttempts3 OK', (res.Volumes||[]).length);
  } catch(e) {
    console.log('maxAttempts3 FAIL', e.Code);
  }

  console.log('--- default SDK retry maxAttempts=10 ---');
  try {
    const res = await client('sa-east-1', 10).send(new DescribeVolumesCommand({}));
    console.log('maxAttempts10 OK', (res.Volumes||[]).length);
  } catch(e) {
    console.log('maxAttempts10 FAIL', e.Code);
  }
}
main();
