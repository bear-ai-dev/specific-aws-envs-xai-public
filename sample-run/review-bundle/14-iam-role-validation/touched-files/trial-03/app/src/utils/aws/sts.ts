import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

export const assumeRole = async (
    roleArn: string,
    externalId?: string,
    region: string = 'us-east-1',
): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}> => {
    const client = new STSClient({ region });
    const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: 'meteringco-scraper-validation',
        ExternalId: externalId || undefined,
    });
    const response = await client.send(command);
    const credentials = response.Credentials;
    if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey) {
        throw new Error('AssumeRole did not return credentials');
    }
    return {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
    };
};
