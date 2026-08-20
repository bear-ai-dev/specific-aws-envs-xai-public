import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { BadRequestException, Logger } from '@nestjs/common';

const logger = new Logger('ScraperRole');

export type ScraperRoleCredentials = {
    iamRoleArn?: string;
    externalId?: string;
};

/**
 * A settings block that names no role is invalid rather than a disconnect.
 * A blank role is the disconnect signal and is handled by the caller.
 */
export function scraperRoleIsDisconnect(cloudIAM: ScraperRoleCredentials): boolean {
    return cloudIAM.iamRoleArn === '';
}

export function scraperRoleNamesNoRole(cloudIAM: ScraperRoleCredentials): boolean {
    return cloudIAM.iamRoleArn === undefined || cloudIAM.iamRoleArn === null;
}

/**
 * Prove the scraper role can be assumed with the supplied external id and that
 * the returned credentials can read the instance inventory used by collection.
 * Failure of either check is a bad request.
 */
export async function proveScraperRoleCanBeAssumed({
    iamRoleArn,
    externalId,
}: ScraperRoleCredentials): Promise<void> {
    if (!iamRoleArn) {
        throw new BadRequestException(['IAM role is required']);
    }

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    try {
        const credentials = fromTemporaryCredentials({
            params: {
                RoleArn: iamRoleArn,
                ExternalId: externalId ? externalId : undefined,
                RoleSessionName: 'meteringco-scraper-validation',
            },
            clientConfig: { region },
        });
        // Force the assume-role call before using the credentials for inventory.
        await credentials();
        const ec2Client = new EC2Client({ region, credentials });
        await ec2Client.send(new DescribeInstancesCommand({}));
    } catch (err) {
        if (err instanceof BadRequestException) {
            throw err;
        }
        logger.warn(`Failed to validate scraper IAM role ${iamRoleArn}: ${err?.message || err}`);
        throw new BadRequestException([
            'Unable to assume IAM role or read instance inventory with the supplied credentials',
        ]);
    }
}

/**
 * Normalize a cloudIAM payload for persistence.
 * Blank role = disconnect and must clear the external id.
 */
export function normalizeCloudIAMForSave(cloudIAM: ScraperRoleCredentials): ScraperRoleCredentials {
    if (scraperRoleIsDisconnect(cloudIAM)) {
        return { iamRoleArn: '', externalId: '' };
    }
    return cloudIAM;
}
