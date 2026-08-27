import {
    CloudWatchClient,
    GetMetricDataCommand,
    GetMetricStatisticsCommand,
    MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import { getAwsClientConfig } from './awsClient.js';

const NETWORK_OUT_CHUNK_SIZE = 500;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const FIVE_MINUTES_SECONDS = 300;

const sumValues = (values: number[] | undefined): number =>
    (values || []).reduce((acc, value) => acc + (Number(value) || 0), 0);

/**
 * Sum of AWS/EC2 NetworkOut (bytes leaving the instance) over the last five-minute interval
 * for each supplied instance id. Instances with no datapoints contribute 0.
 */
export const getNetworkOutBytesByInstance = async (
    region: string,
    creds,
    instanceIds: string[],
    endTime: Date = new Date(),
    startTime: Date = new Date(endTime.getTime() - FIVE_MINUTES_MS),
): Promise<Record<string, number>> => {
    const totals: Record<string, number> = {};
    instanceIds.forEach((id) => {
        totals[id] = 0;
    });
    if (!instanceIds.length) {
        return totals;
    }

    const cloudWatchClient = new CloudWatchClient(getAwsClientConfig(region, creds));

    try {
        for (let offset = 0; offset < instanceIds.length; offset += NETWORK_OUT_CHUNK_SIZE) {
            const chunk = instanceIds.slice(offset, offset + NETWORK_OUT_CHUNK_SIZE);
            const queries: MetricDataQuery[] = chunk.map((instanceId, index) => ({
                Id: `m${offset + index}`,
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/EC2',
                        MetricName: 'NetworkOut',
                        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                    },
                    Period: FIVE_MINUTES_SECONDS,
                    Stat: 'Sum',
                    Unit: 'Bytes',
                },
                ReturnData: true,
            }));

            const response = await cloudWatchClient.send(
                new GetMetricDataCommand({
                    StartTime: startTime,
                    EndTime: endTime,
                    MetricDataQueries: queries,
                }),
            );

            (response.MetricDataResults || []).forEach((result) => {
                const queryIndex = Number((result.Id || 'm0').replace(/^m/, ''));
                const instanceId = instanceIds[queryIndex];
                if (!instanceId) {
                    return;
                }
                totals[instanceId] = sumValues(result.Values);
            });
        }
    } catch (err) {
        // Fall through to GetMetricStatistics when GetMetricData is unavailable.
    }

    const missing = instanceIds.filter((id) => !totals[id]);
    if (missing.length) {
        await Promise.all(
            missing.map(async (instanceId) => {
                try {
                    const stats = await cloudWatchClient.send(
                        new GetMetricStatisticsCommand({
                            Namespace: 'AWS/EC2',
                            MetricName: 'NetworkOut',
                            Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                            StartTime: startTime,
                            EndTime: endTime,
                            Period: FIVE_MINUTES_SECONDS,
                            Statistics: ['Sum'],
                            Unit: 'Bytes',
                        }),
                    );
                    totals[instanceId] = (stats.Datapoints || []).reduce(
                        (acc, point) => acc + (Number(point.Sum) || 0),
                        0,
                    );
                } catch (err) {
                    totals[instanceId] = totals[instanceId] || 0;
                }
            }),
        );
    }

    return totals;
};
