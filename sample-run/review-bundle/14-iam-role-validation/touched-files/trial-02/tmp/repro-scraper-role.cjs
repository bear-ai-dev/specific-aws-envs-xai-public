const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');

async function prove(iamRoleArn, externalId) {
    let credentials;
    try {
        const client = new STSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        const response = await client.send(new AssumeRoleCommand({
            RoleArn: iamRoleArn,
            RoleSessionName: 'meteringco-scraper-probe',
            ExternalId: externalId || undefined,
        }));
        credentials = response.Credentials;
    } catch (e) {
        throw new Error('Unable to assume the supplied IAM role with the given external id: ' + e.message);
    }
    if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey) {
        throw new Error('Unable to assume the supplied IAM role with the given external id');
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
    } catch (e) {
        throw new Error('Assumed IAM credentials cannot read the instance inventory used by collection: ' + e.message);
    }
}

async function expectReject(label, fn) {
    try {
        await fn();
        console.log('FAIL expected reject:', label);
        process.exitCode = 1;
    } catch (e) {
        console.log('OK rejected', label, '-', e.message.split('\n')[0]);
    }
}

async function expectOk(label, fn) {
    try {
        await fn();
        console.log('OK accepted', label);
    } catch (e) {
        console.log('FAIL expected ok:', label, e.message);
        process.exitCode = 1;
    }
}

(async () => {
    await expectOk('usage-scraper with matching external id', () =>
        prove('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'nw-7f31c2'),
    );
    await expectReject('usage-scraper with wrong external id', () =>
        prove('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'wrong-id'),
    );
    await expectOk('open-scraper with no external id', () =>
        prove('arn:aws:iam::300000000011:role/meteringco-open-scraper'),
    );
    await expectReject('reports-reader can assume but cannot describe instances', () =>
        prove('arn:aws:iam::300000000011:role/meteringco-reports-reader', 'nw-a01b'),
    );
    await expectReject('bare role can assume but cannot describe instances', () =>
        prove('arn:aws:iam::300000000022:role/meteringco-bare-role'),
    );
    await expectReject('deployment-pipeline does not trust platform', () =>
        prove('arn:aws:iam::300000000011:role/deployment-pipeline'),
    );
    await expectOk('staging scraper with matching external id', () =>
        prove('arn:aws:iam::300000000022:role/meteringco-staging-scraper', 'nw-stg-4410'),
    );
    await expectReject('spend-reader can assume but cannot describe instances', () =>
        prove('arn:aws:iam::300000000011:role/meteringco-spend-reader'),
    );
})();
