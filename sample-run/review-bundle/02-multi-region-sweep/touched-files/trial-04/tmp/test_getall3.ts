// @ts-nocheck
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
            if (!isRetryableRegionError(error) || retryCounter >= MAX_REGION_READ_ATTEMPTS) {
                throw error;
            }
            retryCounter += 1;
            await sleep(200 * Math.random() * retryCounter);
        }
    }
};

const getEnabledRegions = async (creds) => {
    const region = process.env.AWS_REGION || 'us-east-1';
    const ec2Client = new EC2Client({ credentials: creds, region });
    const response = await sendWithTransientRetry(() =>
        ec2Client.send(new DescribeRegionsCommand({ AllRegions: true })),
    );
    return (response.Regions || [])
        .filter(({ RegionName, OptInStatus }) => RegionName && OptInStatus !== 'not-opted-in')
        .map(({ RegionName }) => RegionName);
};

const collectFromEnabledRegions = async (creds, collect) => {
    const enabledRegions = await getEnabledRegions(creds);
    console.log('enabled', enabledRegions);
    const inventory = await Promise.all(
        enabledRegions.map(async (region) => {
            try {
                const ec2Client = new EC2Client({ credentials: creds, region });
                const items = await collect(ec2Client);
                return [region, items];
            } catch (error) {
                const code = getAwsErrorCode(error);
                console.log('skip', region, code, error.message);
                return null;
            }
        }),
    );

    return inventory.reduce((acc, entry) => {
        if (entry) {
            const [region, items] = entry;
            acc[region] = items;
        }
        return acc;
    }, {});
};

const paginateDescribe = async (sendPage) => {
    const items = [];
    let next;
    do {
        const response = await sendWithTransientRetry(() => sendPage(next));
        next = response?.next;
        if (response.items) {
            items.push(...response.items);
        }
    } while (next);
    return items;
};

async function main() {
    const creds = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
    const volumes = await collectFromEnabledRegions(creds, async (ec2Client) =>
        paginateDescribe(async (next) => {
            const response = await ec2Client.send(new DescribeVolumesCommand({ NextToken: next }));
            return { items: response.Volumes, next: response?.NextToken };
        }),
    );
    console.log('VOLUMES KEYS', Object.keys(volumes).sort());
    for (const [k,v] of Object.entries(volumes)) console.log(k, v.length);

    const snapshots = await collectFromEnabledRegions(creds, async (ec2Client) =>
        paginateDescribe(async (next) => {
            const response = await ec2Client.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'], NextToken: next }));
            return { items: response.Snapshots, next: response?.NextToken };
        }),
    );
    console.log('SNAPSHOTS KEYS', Object.keys(snapshots).sort());
    for (const [k,v] of Object.entries(snapshots)) console.log(k, v.length);
}
main().catch(console.error);
