import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const region = process.env.AWS_REGION || 'us-east-1';

async function prove({ iamRoleArn, externalId }) {
  const credentials = fromTemporaryCredentials({
    params: {
      RoleArn: iamRoleArn,
      ExternalId: externalId ? externalId : undefined,
      RoleSessionName: 'meteringco-scraper-validation',
    },
    clientConfig: { region },
  });
  await credentials();
  const ec2Client = new EC2Client({ region, credentials });
  await ec2Client.send(new DescribeInstancesCommand({}));
}

const sts = new STSClient({ region });
const ident = await sts.send(new GetCallerIdentityCommand({}));
const okArn = `arn:aws:iam::${ident.Account}:role/meteringco-scraper`;
const noEc2Arn = `arn:aws:iam::${ident.Account}:role/meteringco-scraper-no-ec2`;
const unassumable = `arn:aws:iam::${ident.Account}:role/meteringco-scraper-unassumable`;

// 1. valid role + matching external id + inventory
try {
  await prove({ iamRoleArn: okArn, externalId: 'ext-123' });
  console.log('PASS valid role + ext + inventory');
} catch (e) {
  console.log('FAIL valid role', e.name, e.message?.slice(0,200));
}

// 2. valid role + wrong external id
try {
  await prove({ iamRoleArn: okArn, externalId: 'wrong' });
  console.log('FAIL should have rejected wrong ext');
} catch (e) {
  console.log('PASS wrong ext rejected', e.name);
}

// 3. unassumable
try {
  await prove({ iamRoleArn: unassumable, externalId: '' });
  console.log('FAIL should have rejected unassumable');
} catch (e) {
  console.log('PASS unassumable rejected', e.name);
}

// 4. assumed but cannot read inventory
try {
  await prove({ iamRoleArn: noEc2Arn, externalId: '' });
  console.log('FAIL should have rejected no-ec2 inventory');
} catch (e) {
  console.log('PASS no-ec2 inventory rejected', e.name);
}

// 5. fake role
try {
  await prove({ iamRoleArn: 'wow a fake role', externalId: 'foobar' });
  console.log('FAIL should have rejected fake role');
} catch (e) {
  console.log('PASS fake role rejected', e.name);
}
