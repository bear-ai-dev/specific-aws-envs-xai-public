import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { BadRequestException } from '@nestjs/common';

const defaultRegion = () => process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

/**
 * Assume a customer scraper role with the supplied external id and return the
 * temporary credentials STS issued. Failure is a bad request.
 */
export const assumeScraperRole = async ({
    iamRoleArn,
    externalId,
    region = defaultRegion(),
}: {
    iamRoleArn: string;
    externalId?: string;
    region?: string;
}) => {
    try {
        const provider = fromTemporaryCredentials({
            params: {
                RoleArn: iamRoleArn,
                RoleSessionName: 'meteringco-scraper-validation',
                ExternalId: externalId ? externalId : undefined,
            },
            clientConfig: { region },
        });
        const credentials = await provider();
        if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
            throw new Error('AssumeRole returned no credentials');
        }
        return credentials;
    } catch (error) {
        if (error instanceof BadRequestException) {
            throw error;
        }
        throw new BadRequestException(['Unable to assume the IAM role with the provided external ID']);
    }
};

/**
 * Use assumed credentials to read the EC2 instance inventory that collection uses.
 * Failure is a bad request.
 */
export const assertCredentialsCanReadInstanceInventory = async ({
    credentials,
    region = defaultRegion(),
}: {
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    region?: string;
}): Promise<void> => {
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
    } catch (error) {
        if (error instanceof BadRequestException) {
            throw error;
        }
        throw new BadRequestException([
            'IAM role credentials cannot read the instance inventory used by collection',
        ]);
    }
};

/**
 * Prove a customer scraper role can be assumed with the supplied external id
 * and that the returned credentials can read the instance inventory used by collection.
 */
export const proveScraperRoleCanCollect = async ({
    iamRoleArn,
    externalId,
    region = defaultRegion(),
}: {
    iamRoleArn: string;
    externalId?: string;
    region?: string;
}): Promise<void> => {
    const credentials = await assumeScraperRole({ iamRoleArn, externalId, region });
    await assertCredentialsCanReadInstanceInventory({ credentials, region });
};
