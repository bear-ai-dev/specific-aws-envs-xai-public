import { EC2Client, DescribeRegionsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';

// Reproduce the current getAllVolumes behavior vs desired multi-region sweep
const creds = undefined; // default env credentials
const region = process.env.AWS_REGION || 'us-east-1';
const Filters = [];

async function currentGetAllVolumes() {
    const ec2Client = new EC2Client({ region });
    const volumes = [];
    let next;
    do {
        const response = await ec2Client.send(new DescribeVolumesCommand({ Filters, NextToken: next }));
        next = response?.NextToken;
        if (response.Volumes) volumes.push(...response.Volumes);
    } while (next);
    return { [region]: volumes };
}

const current = await currentGetAllVolumes();
console.log('CURRENT getAllVolumes keys:', Object.keys(current));
console.log('CURRENT result:', JSON.stringify(current, null, 2));

const discovery = new EC2Client({ region });
const all = await discovery.send(new DescribeRegionsCommand({ AllRegions: true }));
console.log('\nAccount regions:');
for (const r of all.Regions) {
    console.log(`  ${r.RegionName} optIn=${r.OptInStatus}`);
}
