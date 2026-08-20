import { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

const endpoint = process.env.AWS_ENDPOINT_URL;
console.log('endpoint', endpoint);

const sts = new STSClient({ region: 'us-east-1' });
const assumed = await sts.send(new AssumeRoleCommand({
  RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
  RoleSessionName: 'probe',
  ExternalId: 'orchard-sbx-4f21',
}));
const creds = {
  accessKeyId: assumed.Credentials.AccessKeyId,
  secretAccessKey: assumed.Credentials.SecretAccessKey,
  sessionToken: assumed.Credentials.SessionToken,
};
console.log('assumed', assumed.Credentials.AccessKeyId);

const client = new EC2Client({ region: 'us-east-1', credentials: creds });
const regions = await client.send(new DescribeRegionsCommand({}));
console.log('enabled regions', regions.Regions.map(r => ({name: r.RegionName, opt: r.OptInStatus})));

const all = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
console.log('all regions', all.Regions.map(r => ({name: r.RegionName, opt: r.OptInStatus})));

for (const r of regions.Regions) {
  const name = r.RegionName;
  const c = new EC2Client({ region: name, credentials: creds, maxAttempts: 3 });
  try {
    const start = Date.now();
    const vols = await c.send(new DescribeVolumesCommand({}));
    console.log(name, 'OK default-retry volumes=', (vols.Volumes||[]).length, 'ms', Date.now()-start, 'next', vols.NextToken);
  } catch (e) {
    console.log(name, 'FAIL default-retry', e.name, e.message, e.$metadata?.httpStatusCode);
  }
}

console.log('--- with maxAttempts 10 ---');
for (const r of regions.Regions) {
  const name = r.RegionName;
  const c = new EC2Client({ region: name, credentials: creds, maxAttempts: 10 });
  try {
    const start = Date.now();
    let next, allv=[];
    do {
      const vols = await c.send(new DescribeVolumesCommand({ NextToken: next }));
      allv.push(...(vols.Volumes||[]));
      next = vols.NextToken;
    } while (next);
    console.log(name, 'OK volumes=', allv.length, allv.map(v=>v.VolumeId), 'ms', Date.now()-start);
  } catch (e) {
    console.log(name, 'FAIL', e.name, e.message, e.$metadata?.httpStatusCode);
  }
}
