import { IAMClient, ListRolesCommand, GetRoleCommand, ListAttachedRolePoliciesCommand, ListRolePoliciesCommand, GetRolePolicyCommand } from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } from '@aws-sdk/client-ec2';

const endpoint = process.env.AWS_ENDPOINT_URL;
const region = process.env.AWS_REGION || 'us-east-1';
console.log('endpoint', endpoint, 'region', region, 'key', process.env.AWS_ACCESS_KEY_ID);

const iam = new IAMClient({ region, endpoint });
const sts = new STSClient({ region, endpoint });
const ec2 = new EC2Client({ region, endpoint });

try {
  const ident = await sts.send(new GetCallerIdentityCommand({}));
  console.log('CALLER', JSON.stringify(ident, null, 2));
} catch (e) {
  console.log('STS identity error', e.name, e.message, e.Code);
}

try {
  const roles = await iam.send(new ListRolesCommand({}));
  console.log('ROLES', JSON.stringify(roles.Roles?.map(r => ({Arn: r.Arn, RoleName: r.RoleName, AssumeRolePolicyDocument: r.AssumeRolePolicyDocument})), null, 2));
} catch (e) {
  console.log('IAM list roles error', e.name, e.message);
}

try {
  const inst = await ec2.send(new DescribeInstancesCommand({}));
  console.log('INSTANCES', JSON.stringify(inst, null, 2).slice(0, 4000));
} catch (e) {
  console.log('EC2 describe error', e.name, e.message);
}

try {
  const regions = await ec2.send(new DescribeRegionsCommand({}));
  console.log('REGIONS', regions.Regions?.map(r => r.RegionName));
} catch (e) {
  console.log('EC2 regions error', e.name, e.message);
}
