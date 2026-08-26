import { assumeRole } from '/app/src/utils/aws/sts.ts';
// can't import TS directly. Use AWS SDK directly to verify emulator behavior
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';

const sts = new STSClient({ region: 'us-east-1' });

async function tryAssume(roleArn, externalId) {
  try {
    const res = await sts.send(new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'meteringco-scraper-validation',
      ExternalId: externalId || undefined,
    }));
    return { ok: true, creds: {
      accessKeyId: res.Credentials.AccessKeyId,
      secretAccessKey: res.Credentials.SecretAccessKey,
      sessionToken: res.Credentials.SessionToken,
    }};
  } catch (e) {
    return { ok: false, error: e.name + ': ' + e.message };
  }
}

async function tryInventory(creds) {
  try {
    const ec2 = new EC2Client({ region: 'us-east-1', credentials: creds });
    const res = await ec2.send(new DescribeInstancesCommand({}));
    return { ok: true, reservations: res.Reservations?.length ?? 0 };
  } catch (e) {
    return { ok: false, error: e.name + ': ' + e.message };
  }
}

const cases = [
  ['good role + ext', 'arn:aws:iam::600000000042:role/meteringco-scraper-good', 'ext-good'],
  ['good role + wrong ext', 'arn:aws:iam::600000000042:role/meteringco-scraper-good', 'wrong'],
  ['good role + no ext', 'arn:aws:iam::600000000042:role/meteringco-scraper-good', undefined],
  ['missing role', 'arn:aws:iam::600000000042:role/does-not-exist', 'ext-good'],
  ['nodesc role', 'arn:aws:iam::600000000042:role/meteringco-scraper-nodesc', 'ext-nodesc'],
];

for (const [name, arn, ext] of cases) {
  const assumed = await tryAssume(arn, ext);
  if (!assumed.ok) {
    console.log(name, 'ASSUME_FAIL', assumed.error);
    continue;
  }
  const inv = await tryInventory(assumed.creds);
  console.log(name, 'ASSUME_OK', inv.ok ? 'INVENTORY_OK' : 'INVENTORY_FAIL ' + inv.error);
}
