import { CloudWatchClient, GetMetricDataCommand, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

const cw = new CloudWatchClient({});

const series = [
  ['biz-ridge', 'cus_sample_alpha', 'ridge-api-calls'],
  ['biz-ridge', 'cus_sample_alpha', 'ridge-seats'],
  ['biz-ridge', 'cus_sample_alpha', 'ridge-alerts'],
  ['biz-ridge', 'cus_sample_alpha', 'ridge-reports'],
  ['biz-ridge', 'cus_sample_alpha', 'ridge-storage'],
  ['biz-ridge', 'cus_sample_bravo', 'ridge-jobs'],
  ['biz-ridge', 'cus_sample_bravo', 'ridge-minutes'],
  ['biz-ridge', 'cus_sample_bravo', 'ridge-scans'],
  ['biz-ridge', 'cus_sample_bravo', 'ridge-tasks'],
  ['biz-vale', 'cus_sample_charlie', 'vale-messages'],
  ['biz-vale', 'cus_sample_charlie', 'vale-hours'],
  ['biz-vale', 'cus_sample_charlie', 'vale-units'],
];

const startTime = new Date('2026-07-01T00:00:00Z');
const endTime = new Date('2026-08-01T00:00:00Z');

for (const [biz, cus, dim] of series) {
  const response = await cw.send(new GetMetricDataCommand({
    StartTime: startTime,
    EndTime: endTime,
    ScanBy: 'TimestampAscending',
    MetricDataQueries: [{
      Id: 'series',
      ReturnData: true,
      MetricStat: {
        Metric: {
          Namespace: 'MeteringCo/Usage',
          MetricName: 'AggregatedUsage',
          Dimensions: [
            { Name: 'BusinessId', Value: biz },
            { Name: 'CustomerId', Value: cus },
            { Name: 'DimensionId', Value: dim },
          ],
        },
        Period: 3600,
        Stat: 'Sum',
      },
    }],
  }));
  const result = response.MetricDataResults?.[0];
  const values = result?.Values ?? [];
  const timestamps = result?.Timestamps ?? [];
  const sum = values.reduce((a, b) => a + b, 0);
  console.log(`\n=== ${biz} / ${cus} / ${dim} ===`);
  console.log(`count=${values.length} sum=${sum}`);
  timestamps.forEach((t, i) => {
    console.log(`  ${new Date(t).toISOString()} => ${values[i]}`);
  });
}
