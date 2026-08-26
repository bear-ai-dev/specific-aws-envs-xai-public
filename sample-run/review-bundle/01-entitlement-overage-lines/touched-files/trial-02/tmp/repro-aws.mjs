import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const s3 = new S3Client({});
const cw = new CloudWatchClient({});

async function getDoc(Bucket, Key) {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket, Key }));
  return JSON.parse(await Body.transformToString());
}

async function getSeries({ namespace, metricName, dimensions, startTime, endTime, period }) {
  const readings = [];
  let NextToken;
  do {
    const response = await cw.send(new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: endTime,
      ScanBy: 'TimestampAscending',
      NextToken,
      MetricDataQueries: [{
        Id: 'series',
        ReturnData: true,
        MetricStat: {
          Metric: {
            Namespace: namespace,
            MetricName: metricName,
            Dimensions: Object.keys(dimensions).map((Name) => ({ Name, Value: dimensions[Name] })),
          },
          Period: period,
          Stat: 'Sum',
        },
      }],
    }));
    (response?.MetricDataResults ?? []).forEach((metricDataResult) => {
      const values = metricDataResult?.Values ?? [];
      (metricDataResult?.Timestamps ?? []).forEach((timestamp, index) => {
        readings.push({
          timestamp: new Date(timestamp).toISOString(),
          value: Number(values[index] ?? 0),
        });
      });
    });
    NextToken = response?.NextToken;
  } while (NextToken);
  return readings.sort((a,b) => a.timestamp.localeCompare(b.timestamp));
}

for (const key of ['catalogues/biz-ridge-2026-07.json', 'catalogues/biz-vale-2026-07.json']) {
  const cat = await getDoc('meteringco-billing-sandbox', key);
  console.log('CAT', key, 'settings', cat.settings, 'enrolments', cat.enrolments.length);
  for (const enr of cat.enrolments) {
    const offering = cat.offerings.find(o => o.offeringId === enr.offeringId);
    console.log('  customer', enr.customerId, 'offering', offering.offeringName);
    for (const dim of offering.dimensions) {
      const readings = await getSeries({
        namespace: cat.usageNamespace,
        metricName: cat.usageMetricName,
        dimensions: {
          BusinessId: cat.businessID,
          CustomerId: enr.customerId,
          DimensionId: dim.dimensionId,
        },
        startTime: new Date(cat.periodStart),
        endTime: new Date(cat.periodEnd),
        period: cat.usagePeriod,
      });
      const total = readings.reduce((a,r) => a + r.value, 0);
      console.log('   ', dim.dimensionId, 'price', dim.consumptionPrice, 'ent', dim.usageEntitlement, 'overage', dim.overageAllowed, 'readings', readings, 'total', total);
    }
  }
}
