import { getAllVolumes } from '/app/src/utils/aws/awsEc2.ts';

const creds = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
};

(async () => {
    const result = await getAllVolumes(creds);
    const keys = Object.keys(result).sort();
    console.log('KEYS', keys);
    for (const key of keys) {
        console.log(key, 'count', result[key].length);
    }
    const expectedPresent = ['ap-northeast-2', 'eu-central-1', 'eu-west-1', 'sa-east-1', 'us-east-1'];
    const expectedAbsent = ['ap-south-1', 'me-south-1'];
    const missing = expectedPresent.filter((r) => !keys.includes(r));
    const leaked = expectedAbsent.filter((r) => keys.includes(r));
    console.log('missing expected', missing);
    console.log('leaked unexpected', leaked);
    if (missing.length || leaked.length) {
        process.exitCode = 1;
    } else {
        console.log('PASS: enabled readable regions returned, unreadable/not-enabled omitted');
    }
})();
