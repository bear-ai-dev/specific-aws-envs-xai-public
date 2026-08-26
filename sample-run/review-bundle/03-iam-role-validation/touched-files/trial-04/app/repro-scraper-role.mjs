import { proveScraperRoleCanCollect, assumeScraperRole, assertCredentialsCanReadInstanceInventory } from '../app/src/utils/aws/sts.ts';

// We'll run via node after compiling or just inline the same logic.
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { IAMClient, CreateRoleCommand, PutRolePolicyCommand } from '@aws-sdk/client-iam';

const region = process.env.AWS_REGION || 'us-east-1';
const endpoint = process.env.AWS_ENDPOINT_URL;
const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
const iam = new IAMClient({ region, endpoint, credentials: creds });

const trust = (ext) => JSON.stringify({
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: { AWS: "arn:aws:iam::600000000042:root" },
    Action: "sts:AssumeRole",
    ...(ext ? { Condition: { StringEquals: { "sts:ExternalId": ext } } } : {})
  }]
});

async function prove({ iamRoleArn, externalId }) {
  const provider = fromTemporaryCredentials({
    params: {
      RoleArn: iamRoleArn,
      RoleSessionName: 'meteringco-scraper-validation',
      ExternalId: externalId ? externalId : undefined,
    },
    clientConfig: { region },
  });
  let credentials;
  try {
    credentials = await provider();
  } catch (e) {
    const err = new Error('Unable to assume the IAM role with the provided external ID');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  try {
    const ec2 = new EC2Client({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
    await ec2.send(new DescribeInstancesCommand({}));
  } catch (e) {
    const err = new Error('IAM role credentials cannot read the instance inventory used by collection');
    err.code = 'BAD_REQUEST';
    throw err;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 1. valid role + external id
try {
  await prove({ iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper', externalId: 'ext-good' });
  console.log('PASS valid role+externalId');
} catch (e) {
  console.error('FAIL valid role+externalId', e.message);
  process.exitCode = 1;
}

// 2. wrong external id
try {
  await prove({ iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper', externalId: 'wrong-id' });
  console.error('FAIL wrong externalId should have been rejected');
  process.exitCode = 1;
} catch (e) {
  assert(e.code === 'BAD_REQUEST', 'expected bad request');
  console.log('PASS wrong externalId rejected:', e.message);
}

// 3. missing role
try {
  await prove({ iamRoleArn: 'arn:aws:iam::600000000042:role/does-not-exist', externalId: 'ext-good' });
  console.error('FAIL missing role should have been rejected');
  process.exitCode = 1;
} catch (e) {
  assert(e.code === 'BAD_REQUEST', 'expected bad request');
  console.log('PASS missing role rejected:', e.message);
}

// 4. assume works but cannot describe instances
try {
  await prove({ iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper-no-ec2', externalId: 'ext-no-ec2' });
  console.error('FAIL no-ec2 role should have been rejected');
  process.exitCode = 1;
} catch (e) {
  assert(e.code === 'BAD_REQUEST', 'expected bad request');
  console.log('PASS no-ec2 inventory rejected:', e.message);
}

console.log('repro done, exit', process.exitCode || 0);
