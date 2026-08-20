// Reproduce current getAllVolumes behavior vs the required multi-region sweep.
import { createRequire } from 'module';
const require = createRequire('/app/package.json');
const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } = require('@aws-sdk/client-ec2');

const creds = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

async function currentGetAllVolumes() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const ec2Client = new EC2Client({ credentials: creds, region });
  const volumes = [];
  let next;
  do {
    const response = await ec2Client.send(new DescribeVolumesCommand({ NextToken: next }));
    next = response?.NextToken;
    if (response.Volumes) volumes.push(...response.Volumes);
  } while (next);
  return { [region]: volumes };
}

(async () => {
  const current = await currentGetAllVolumes();
  console.log('CURRENT getAllVolumes keys:', Object.keys(current));
  console.log('CURRENT result:', JSON.stringify(current, null, 2));
})();
