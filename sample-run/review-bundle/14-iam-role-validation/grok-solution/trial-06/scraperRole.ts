import { AssumeRoleCommand, Credentials, STSClient } from '@aws-sdk/client-sts';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { BadRequestException } from '@nestjs/common';

export const InvalidIamRoleMessage = 'Invalid IAM role or external ID';

export type ScraperRoleInput = {
    iamRoleArn?: string;
    externalId?: string;
};

const isPresentRole = (iamRoleArn: unknown): iamRoleArn is string =>
    typeof iamRoleArn === 'string' && iamRoleArn.trim() !== '';

function rejectIam(): never {
    throw new BadRequestException([InvalidIamRoleMessage]);
}

/**
 * A blank role is an explicit disconnect. A settings block that does not name a
 * role at all is invalid rather than a disconnect.
 */
export function normalizeCloudIamForSave(cloudIAM: ScraperRoleInput | null | undefined): ScraperRoleInput {
    if (cloudIAM == null || cloudIAM.iamRoleArn === undefined || cloudIAM.iamRoleArn === null) {
        rejectIam();
    }
    if (typeof cloudIAM.iamRoleArn !== 'string') {
        rejectIam();
    }
    const iamRoleArn = cloudIAM.iamRoleArn.trim();
    if (iamRoleArn === '') {
        return { iamRoleArn: '' };
    }
    const externalId =
        cloudIAM.externalId == null || String(cloudIAM.externalId).trim() === ''
            ? undefined
            : String(cloudIAM.externalId).trim();
    return externalId ? { iamRoleArn, externalId } : { iamRoleArn };
}

/**
 * Prove the role can be assumed with the supplied external id. A blank external
 * id is omitted entirely: AWS rejects an empty ExternalId before consulting the
 * trust policy.
 */
export async function assumeScraperRole(iamRoleArn: string, externalId?: string): Promise<Credentials> {
    const sts = new STSClient({ region: 'us-east-1' });
    const params: ConstructorParameters<typeof AssumeRoleCommand>[0] = {
        RoleArn: iamRoleArn,
        RoleSessionName: 'meteringco-scraper-validation',
    };
    if (externalId) {
        params.ExternalId = externalId;
    }
    const response = await sts.send(new AssumeRoleCommand(params));
    if (!response.Credentials?.AccessKeyId || !response.Credentials?.SecretAccessKey) {
        throw new Error('AssumeRole returned no credentials');
    }
    return response.Credentials;
}

/**
 * Prove the assumed credentials can read the instance inventory used by collection.
 */
export async function readInstanceInventory(credentials: Credentials): Promise<void> {
    const ec2 = new EC2Client({
        region: 'us-east-1',
        credentials: {
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretAccessKey,
            sessionToken: credentials.SessionToken,
        },
    });
    await ec2.send(new DescribeInstancesCommand({}));
}

export async function proveScraperRoleAccess(iamRoleArn: string, externalId?: string): Promise<void> {
    try {
        const credentials = await assumeScraperRole(iamRoleArn, externalId);
        await readInstanceInventory(credentials);
    } catch (err) {
        if (err instanceof BadRequestException) {
            throw err;
        }
        rejectIam();
    }
}

export async function prepareCloudIamForSave(cloudIAM: ScraperRoleInput | null | undefined): Promise<ScraperRoleInput> {
    const normalized = normalizeCloudIamForSave(cloudIAM);
    if (isPresentRole(normalized.iamRoleArn)) {
        await proveScraperRoleAccess(normalized.iamRoleArn, normalized.externalId);
    }
    return normalized;
}
