import { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand } from '@aws-sdk/client-ec2';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const endpoint = process.env.AWS_ENDPOINT_URL;
console.log('endpoint', endpoint);
console.log('region', process.env.AWS_REGION);

const sts = new STSClient({ region: 'us-east-1' });
try {
  const ident = await sts.send(new GetCallerIdentityCommand({}));
  console.log('identity', ident);
} catch (e) {
  console.log('identity error', e.name, e.message, e.$metadata);
}

try {
  const assumed = await sts.send(new AssumeRoleCommand({
    RoleArn: 'arn:aws:iam::100000000077:role/meteringco-metering',
    RoleSessionName: 'probe',
    ExternalId: 'orchard-sbx-4f21',
  }));
  console.log('assumed', assumed.Credentials?.AccessKeyId, assumed.AssumedRoleUser);
  const creds = {
    accessKeyId: assumed.Credentials.AccessKeyId,
    secretAccessKey: assumed.Credentials.SecretAccessKey,
    sessionToken: assumed.Credentials.SessionToken,
  };

  const ec2 = new EC2Client({ region: 'us-east-1', credentials: creds });
  const regions = await ec2.send(new DescribeRegionsCommand({}));
  console.log('enabled regions', JSON.stringify(regions.Regions, null, 2));

  const all = await ec2.send(new DescribeRegionsCommand({ AllRegions: true }));
  console.log('all regions', JSON.stringify(all.Regions, null, 2));

  for (const r of all.Regions) {
    const client = new EC2Client({ region: r.RegionName, credentials: creds, maxAttempts: 1 });
    try {
      const vols = await client.send(new DescribeVolumesCommand({}));
      console.log('VOLS', r.RegionName, r.OptInStatus, 'count=', vols.Volumes?.length, 'next=', vols.NextToken);
    } catch (e) {
      console.log('VOLS FAIL', r.RegionName, e.name, e.Code, e.message, 'status', e.$metadata?.httpStatusCode);
    }
    try {
      const snaps = await client.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
      console.log('SNAPS', r.RegionName, 'count=', snaps.Snapshots?.length, 'next=', snaps.NextToken);
    } catch (e) {
      console.log('SNAPS FAIL', r.RegionName, e.name, e.message, 'status', e.$metadata?.httpStatusCode);
    }
  }
} catch (e) {
  console.log('assume error', e.name, e.message, e);
}
