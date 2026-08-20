import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';

const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

/**
 * Prove a customer scraper role can be assumed with the supplied external id
 * and that the returned credentials can read the EC2 instance inventory used
 * by collection. Either failure is thrown to the caller.
 *
 * An empty external id is omitted: AWS rejects a blank ExternalId parameter
 * before the trust policy is consulted.
 */
export async function assumeRoleAndReadInstanceInventory(
    iamRoleArn: string,
    externalId?: string,
): Promise<void> {
    const sts = new STSClient({ region: AWS_REGION });
    const assumeParams: ConstructorParameters<typeof AssumeRoleCommand>[0] = {
        RoleArn: iamRoleArn,
        RoleSessionName: 'meteringco-scraper-role-check',
    };
    if (externalId) {
        assumeParams.ExternalId = externalId;
    }

    const assumed = await sts.send(new AssumeRoleCommand(assumeParams));
    const credentials = assumed.Credentials;
    if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey) {
        throw new Error('AssumeRole returned no credentials');
    }

    const ec2 = new EC2Client({
        region: AWS_REGION,
        credentials: {
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretAccessKey,
            sessionToken: credentials.SessionToken,
        },
    });
    await ec2.send(new DescribeInstancesCommand({}));
}
