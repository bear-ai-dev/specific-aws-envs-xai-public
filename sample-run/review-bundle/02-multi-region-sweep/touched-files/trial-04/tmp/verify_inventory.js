const { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand, DescribeSnapshotsCommand } = require('@aws-sdk/client-ec2');

const RETRYABLE_REGION_ERROR_CODES = new Set([
    'RequestLimitExceeded',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'PriorRequestNotComplete',
]);
const UNREADABLE_REGION_ERROR_CODES = new Set([
    'UnauthorizedOperation',
    'AuthFailure',
    'AccessDenied',
    'AccessDeniedException',
    'OptInRequired',
    'UnknownRegion',
    'InvalidClientTokenId',
]);
const MAX_REGION_READ_ATTEMPTS = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getAwsErrorCode = (error) => error?.Code || error?.name || error?.__type || '';
const isRetryableRegionError = (error) => RETRYABLE_REGION_ERROR_CODES.has(getAwsErrorCode(error));

const sendWithTransientRetry = async (send) => {
    let retryCounter = 0;
    while (true) {
        try {
            return await send();
        } catch (error) {
            if (!isRetryableRegionError(error) || retryCounter >= MAX_REGION_READ_ATTEMPTS) throw error;
            retryCounter += 1;
            await sleep(50 * retryCounter);
        }
    }
};

async function collect(creds, kind) {
    const home = new EC2Client({ credentials: creds, region: process.env.AWS_REGION || 'us-east-1' });
    const response = await sendWithTransientRetry(() => home.send(new DescribeRegionsCommand({ AllRegions: true })));
    const enabled = (response.Regions || []).filter(r => r.RegionName && r.OptInStatus !== 'not-opted-in').map(r => r.RegionName);
    const inventory = {};
    await Promise.all(enabled.map(async (region) => {
        try {
            const client = new EC2Client({ credentials: creds, region });
            const items = [];
            let next;
            do {
                const page = await sendWithTransientRetry(() => kind === 'volumes'
                    ? client.send(new DescribeVolumesCommand({ NextToken: next }))
                    : client.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'], NextToken: next })));
                next = page.NextToken;
                items.push(...(page.Volumes || page.Snapshots || []));
            } while (next);
            inventory[region] = items;
        } catch (error) {
            console.log('omit', kind, region, getAwsErrorCode(error));
        }
    }));
    return inventory;
}

(async () => {
    const creds = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
    const volumes = await collect(creds, 'volumes');
    const snapshots = await collect(creds, 'snapshots');
    console.log('volume regions', Object.keys(volumes).sort().join(','));
    console.log('snapshot regions', Object.keys(snapshots).sort().join(','));
    if (!Object.keys(volumes).includes('eu-west-1')) throw new Error('empty enabled region missing from volumes');
    if (!Object.keys(snapshots).includes('eu-west-1')) throw new Error('empty enabled region missing from snapshots');
    if (Object.keys(volumes).includes('me-south-1') || Object.keys(snapshots).includes('me-south-1')) throw new Error('not-opted-in region leaked');
    if (Object.keys(volumes).includes('ap-south-1')) throw new Error('permanently unreadable volume region included');
    if (Object.keys(snapshots).includes('ap-northeast-2')) throw new Error('permanently unreadable snapshot region included');
    console.log('verification passed');
})().catch((e) => { console.error(e); process.exit(1); });
