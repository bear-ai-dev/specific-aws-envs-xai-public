import { IAMClient, CreateRoleCommand, PutRolePolicyCommand } from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

const region = process.env.AWS_REGION || 'us-east-1';
const iam = new IAMClient({ region });
const sts = new STSClient({ region });
const ident = await sts.send(new GetCallerIdentityCommand({}));
console.log('account', ident.Account);

// Role with no EC2 permission
const trustNoExt = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { AWS: ident.Arn },
    Action: 'sts:AssumeRole',
  }]
});

try {
  const created = await iam.send(new CreateRoleCommand({
    RoleName: 'meteringco-scraper-no-ec2',
    AssumeRolePolicyDocument: trustNoExt,
  }));
  console.log('CREATED no-ec2', created.Role?.Arn);
} catch (e) {
  console.log('create no-ec2', e.name, e.message?.slice(0,200));
}

try {
  await iam.send(new PutRolePolicyCommand({
    RoleName: 'meteringco-scraper-no-ec2',
    PolicyName: 'denyec2',
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Deny', Action: ['ec2:*'], Resource: '*' }]
    })
  }));
  console.log('PUT DENY ok');
} catch (e) {
  console.log('put deny', e.name, e.message?.slice(0,200));
}

const noEc2Arn = `arn:aws:iam::${ident.Account}:role/meteringco-scraper-no-ec2`;
try {
  const creds = fromTemporaryCredentials({
    params: { RoleArn: noEc2Arn, RoleSessionName: 'test-noec2' },
    clientConfig: { region },
  });
  const resolved = await creds();
  console.log('ASSUME no-ec2 OK', resolved.accessKeyId);
  const ec2 = new EC2Client({ region, credentials: creds });
  const inst = await ec2.send(new DescribeInstancesCommand({}));
  console.log('DESCRIBE no-ec2 unexpectedly OK', inst.Reservations?.length);
} catch (e) {
  console.log('no-ec2 path', e.name, e.message?.slice(0,400));
}

// Role that cannot be assumed by us (wrong principal)
const trustOther = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { AWS: 'arn:aws:iam::999999999999:root' },
    Action: 'sts:AssumeRole',
  }]
});
try {
  const created = await iam.send(new CreateRoleCommand({
    RoleName: 'meteringco-scraper-unassumable',
    AssumeRolePolicyDocument: trustOther,
  }));
  console.log('CREATED unassumable', created.Role?.Arn);
} catch (e) {
  console.log('create unassumable', e.name, e.message?.slice(0,200));
}

try {
  const creds = fromTemporaryCredentials({
    params: { RoleArn: `arn:aws:iam::${ident.Account}:role/meteringco-scraper-unassumable`, RoleSessionName: 'test-un' },
    clientConfig: { region },
  });
  await creds();
  console.log('ASSUME unassumable unexpectedly OK');
} catch (e) {
  console.log('unassumable', e.name, e.message?.slice(0,400));
}
