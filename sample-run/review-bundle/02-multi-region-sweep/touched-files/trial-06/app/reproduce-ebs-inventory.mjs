/**
 * Reproduce the current getAllVolumes / getAllSnapshots behavior
 * against the local AWS-compatible emulator.
 *
 * Expected after fix:
 *  - Discover every enabled region (not me-south-1)
 *  - Include readable empty regions
 *  - Omit permanently unreadable regions (UnauthorizedOperation)
 *  - Retry rate limits (sa-east-1 RequestLimitExceeded x4)
 *  - A bad region must not collapse the rest
 */
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const ROLE = 'arn:aws:iam::100000000077:role/meteringco-metering';
const EXTERNAL_ID = 'orchard-sbx-4f21';

async function assume() {
    const sts = new STSClient({ region: 'us-east-1' });
    const assumed = await sts.send(
        new AssumeRoleCommand({
            RoleArn: ROLE,
            RoleSessionName: 'reproduce-ebs',
            ExternalId: EXTERNAL_ID,
        }),
    );
    return {
        accessKeyId: assumed.Credentials.AccessKeyId,
        secretAccessKey: assumed.Credentials.SecretAccessKey,
        sessionToken: assumed.Credentials.SessionToken,
    };
}

async function loadFns() {
    // Prefer compiled JS if present, otherwise try ts-node register via dynamic import path.
    try {
        return await import('./src/utils/aws/awsEc2.ts');
    } catch (e) {
        console.error('direct ts import failed:', e.message);
    }
    try {
        return require('./src/utils/aws/awsEc2.ts');
    } catch (e) {
        console.error('require ts failed:', e.message);
    }
    return await import('./src/utils/aws/awsEc2.js');
}

function summarize(label, byRegion) {
    const keys = Object.keys(byRegion).sort();
    console.log(`\n=== ${label} regions (${keys.length}) ===`);
    for (const r of keys) {
        const items = byRegion[r] || [];
        const ids = items.map((i) => i.VolumeId || i.SnapshotId);
        console.log(`  ${r}: ${items.length} -> ${ids.join(',') || '(empty)'}`);
    }
}

const creds = await assume();
console.log('assumed role ok');

let getAllVolumes, getAllSnapshots;
try {
    const mod = await loadFns();
    getAllVolumes = mod.getAllVolumes;
    getAllSnapshots = mod.getAllSnapshots;
} catch (e) {
    console.error('Could not load awsEc2 module', e);
    process.exit(1);
}

try {
    const volumes = await getAllVolumes(creds, [
        { Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] },
    ]);
    summarize('VOLUMES (filtered)', volumes);
} catch (e) {
    console.error('getAllVolumes THREW', e.name, e.message);
}

try {
    const volumesAll = await getAllVolumes(creds, []);
    summarize('VOLUMES (unfiltered)', volumesAll);
} catch (e) {
    console.error('getAllVolumes unfiltered THREW', e.name, e.message);
}

try {
    const snaps = await getAllSnapshots(creds, [
        { Name: 'tag:meteringcoDimensionId', Values: ['dim-block-storage-sandbox'] },
    ]);
    summarize('SNAPSHOTS (filtered)', snaps);
} catch (e) {
    console.error('getAllSnapshots THREW', e.name, e.message);
}

try {
    const snapsAll = await getAllSnapshots(creds, []);
    summarize('SNAPSHOTS (unfiltered)', snapsAll);
} catch (e) {
    console.error('getAllSnapshots unfiltered THREW', e.name, e.message);
}
