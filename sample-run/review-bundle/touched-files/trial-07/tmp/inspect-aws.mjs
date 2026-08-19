import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { CloudWatchClient, ListMetricsCommand } from '@aws-sdk/client-cloudwatch';

const s3 = new S3Client({});
const cw = new CloudWatchClient({});

const buckets = await s3.send(new ListBucketsCommand({}));
console.log('=== BUCKETS ===');
console.log(JSON.stringify(buckets.Buckets, null, 2));

for (const b of buckets.Buckets ?? []) {
  console.log(`\n=== OBJECTS IN ${b.Name} ===`);
  const objs = await s3.send(new ListObjectsV2Command({ Bucket: b.Name }));
  for (const o of objs.Contents ?? []) {
    console.log(`  ${o.Key} (${o.Size} bytes)`);
    if (o.Size < 200000) {
      try {
        const { Body } = await s3.send(new GetObjectCommand({ Bucket: b.Name, Key: o.Key }));
        const text = await Body.transformToString();
        console.log('  CONTENT:', text.slice(0, 8000));
      } catch (e) {
        console.log('  ERROR reading', e.message);
      }
    }
  }
}

console.log('\n=== CLOUDWATCH METRICS ===');
try {
  const metrics = await cw.send(new ListMetricsCommand({}));
  console.log(JSON.stringify(metrics.Metrics, null, 2));
} catch (e) {
  console.log('CW error', e.message);
}
