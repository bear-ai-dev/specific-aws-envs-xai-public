import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { BadRequestException } from '@nestjs/common';

export const assumeRole = async (
    roleArn: string,
    externalId?: string,
    roleSessionName = 'meteringco-scraper-probe',
): Promise<Credentials> => {
    const client = new STSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: roleSessionName,
        ExternalId: externalId || undefined,
    });
    const response = await client.send(command);
    return response.Credentials;
};

/**
 * Prove a customer scraper role can be assumed with the supplied external id
 * and that the returned credentials can read the EC2 instance inventory used
 * by collection. Failure of either check is a bad request.
 */
export async function proveScraperRoleCanCollect(iamRoleArn: string, externalId?: string): Promise<void> {
    let credentials: Credentials | undefined;
    try {
        credentials = await assumeRole(iamRoleArn, externalId);
    } catch {
        throw new BadRequestException(['Unable to assume the supplied IAM role with the given external id']);
    }
    if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey) {
        throw new BadRequestException(['Unable to assume the supplied IAM role with the given external id']);
    }
    try {
        const ec2 = new EC2Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: credentials.AccessKeyId,
                secretAccessKey: credentials.SecretAccessKey,
                sessionToken: credentials.SessionToken,
            },
        });
        await ec2.send(new DescribeInstancesCommand({}));
    } catch {
        throw new BadRequestException([
            'Assumed IAM credentials cannot read the instance inventory used by collection',
        ]);
    }
}
