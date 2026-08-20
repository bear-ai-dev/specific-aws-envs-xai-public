import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { BadRequestException } from '@nestjs/common';

export const assumeRole = async ({
    roleArn,
    externalId,
    region = 'us-east-1',
    roleSessionName = 'meteringco-scraper-validation',
}: {
    roleArn: string;
    externalId?: string;
    region?: string;
    roleSessionName?: string;
}): Promise<AwsCredentialIdentity> => {
    const client = new STSClient({ region });
    const params: { RoleArn: string; RoleSessionName: string; ExternalId?: string } = {
        RoleArn: roleArn,
        RoleSessionName: roleSessionName,
    };
    // AWS rejects a blank ExternalId before consulting the trust policy. Only send it when a real value is supplied.
    if (externalId) {
        params.ExternalId = externalId;
    }
    const response = await client.send(new AssumeRoleCommand(params));
    const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = response.Credentials ?? {};
    if (!AccessKeyId || !SecretAccessKey) {
        throw new Error('AssumeRole did not return credentials');
    }
    return {
        accessKeyId: AccessKeyId,
        secretAccessKey: SecretAccessKey,
        sessionToken: SessionToken,
        expiration: Expiration,
    };
};

/**
 * Prove a customer scraper role can be assumed with the supplied external id
 * and that the returned credentials can read the instance inventory used by collection.
 */
export const validateScraperRole = async ({
    iamRoleArn,
    externalId,
}: {
    iamRoleArn: string;
    externalId?: string;
}): Promise<void> => {
    let credentials: AwsCredentialIdentity;
    try {
        credentials = await assumeRole({ roleArn: iamRoleArn, externalId });
    } catch (err) {
        throw new BadRequestException(['Invalid IAM role or external ID']);
    }
    try {
        const ec2Client = new EC2Client({ region: 'us-east-1', credentials });
        await ec2Client.send(new DescribeInstancesCommand({}));
    } catch (err) {
        throw new BadRequestException(['Invalid IAM role or external ID']);
    }
};
