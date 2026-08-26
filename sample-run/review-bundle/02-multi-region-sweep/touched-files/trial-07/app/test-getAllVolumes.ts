import { getAllVolumes } from './src/utils/aws/awsEc2.ts';

async function main() {
    const result = await getAllVolumes(undefined, []);
    console.log('RESULT KEYS:', Object.keys(result).sort());
    for (const [region, vols] of Object.entries(result)) {
        console.log(region, 'count=', vols.length, 'isArray=', Array.isArray(vols));
    }
    console.log('HAS me-south-1?', Object.prototype.hasOwnProperty.call(result, 'me-south-1'));
    console.log('HAS ap-south-1?', Object.prototype.hasOwnProperty.call(result, 'ap-south-1'));
    console.log('HAS us-east-1?', Object.prototype.hasOwnProperty.call(result, 'us-east-1'));
    console.log('HAS eu-central-1?', Object.prototype.hasOwnProperty.call(result, 'eu-central-1'));
    console.log('HAS sa-east-1?', Object.prototype.hasOwnProperty.call(result, 'sa-east-1'));
    console.log('HAS eu-west-1?', Object.prototype.hasOwnProperty.call(result, 'eu-west-1'));
    console.log('HAS ap-northeast-2?', Object.prototype.hasOwnProperty.call(result, 'ap-northeast-2'));
    console.log('FULL JSON:', JSON.stringify(result, null, 2));
}

main().catch((e) => {
    console.error('FAILED', e);
    process.exit(1);
});
