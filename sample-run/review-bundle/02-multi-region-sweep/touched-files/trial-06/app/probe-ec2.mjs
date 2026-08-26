import { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand } from '@aws-sdk/client-ec2';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

const endpoint = process.env.AWS_ENDPOINT_URL;
console.log('endpoint', endpoint, 'region', process.env.AWS_REGION);

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
console.log('assumed', assumed.AssumedRoleUser);

const ec2 = new EC2Client({ region: 'us-east-1', credentials: creds });
const regions = await ec2.send(new DescribeRegionsCommand({}));
console.log('enabled regions', regions.Regions.map(r => ({name: r.RegionName, opt: r.OptInStatus})));

const all = await ec2.send(new DescribeRegionsCommand({ AllRegions: true }));
console.log('all regions', all.Regions.map(r => ({name: r.RegionName, opt: r.OptInStatus})));

for (const r of regions.Regions.map(x => x.RegionName)) {
  const client = new EC2Client({ region: r, credentials: creds, maxAttempts: 3 });
  try {
    const v = await client.send(new DescribeVolumesCommand({}));
    console.log(r, 'volumes ok', (v.Volumes||[]).map(x => x.VolumeId), 'next', v.NextToken);
  } catch (e) {
    console.log(r, 'volumes FAIL', e.name, e.message, e.$metadata?.httpStatusCode, e.$retryable);
  }
  try {
    const s = await client.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
    console.log(r, 'snapshots ok', (s.Snapshots||[]).map(x => x.SnapshotId), 'next', s.NextToken);
  } catch (e) {
    console.log(r, 'snapshots FAIL', e.name, e.message, e.$metadata?.httpStatusCode, e.$retryable);
  }
}
