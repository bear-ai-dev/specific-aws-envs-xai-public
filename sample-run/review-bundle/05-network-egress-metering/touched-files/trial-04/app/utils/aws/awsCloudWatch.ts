import { CloudWatchClient, GetMetricDataCommand, MetricDataQuery, MetricDataResult } from '@aws-sdk/client-cloudwatch';

const NETWORK_OUT_METRIC = 'NetworkOut';
const EC2_NAMESPACE = 'AWS/EC2';
const DEFAULT_PERIOD_SECONDS = 300;
const DEFAULT_LOOKBACK_MS = 15 * 60 * 1000;
const GET_METRIC_DATA_BATCH_SIZE = 100;

const chunk = <T>(items: T[], size: number): T[][] => {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
    }
    return batches;
};

const latestMetricValue = (result?: MetricDataResult): number | undefined => {
    if (!result?.Values || result.Values.length === 0) {
        return undefined;
    }
    if (!result.Timestamps || result.Timestamps.length === 0) {
        return result.Values[result.Values.length - 1];
    }
    let latestIndex = 0;
    let latestTime = new Date(result.Timestamps[0]).getTime();
    result.Timestamps.forEach((timestamp, index) => {
        const time = new Date(timestamp).getTime();
        if (time >= latestTime) {
            latestTime = time;
            latestIndex = index;
        }
    });
    return result.Values[latestIndex] ?? 0;
};

export const getInstanceNetworkOutBytes = async ({
    region,
    credentials,
    instanceIds,
    endTime = new Date(),
    lookbackMs = DEFAULT_LOOKBACK_MS,
    periodSeconds = DEFAULT_PERIOD_SECONDS,
}: {
    region: string;
    credentials: any;
    instanceIds: string[];
    endTime?: Date;
    lookbackMs?: number;
    periodSeconds?: number;
}): Promise<Record<string, number | undefined>> => {
    const usageByInstance: Record<string, number | undefined> = {};
    if (!instanceIds.length) {
        return usageByInstance;
    }

    const cloudWatch = new CloudWatchClient({ region, credentials });
    const startTime = new Date(endTime.getTime() - lookbackMs);

    for (const batch of chunk(instanceIds, GET_METRIC_DATA_BATCH_SIZE)) {
        const idToInstance = new Map<string, string>();
        const queries: MetricDataQuery[] = batch.map((instanceId, index) => {
            const id = `m${index}`;
            idToInstance.set(id, instanceId);
            return {
                Id: id,
                MetricStat: {
                    Metric: {
                        Namespace: EC2_NAMESPACE,
                        MetricName: NETWORK_OUT_METRIC,
                        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                    },
                    Period: periodSeconds,
                    Stat: 'Sum',
                    Unit: 'Bytes',
                },
                ReturnData: true,
            };
        });

        let nextToken: string | undefined;
        do {
            const response = await cloudWatch.send(
                new GetMetricDataCommand({
                    StartTime: startTime,
                    EndTime: endTime,
                    MetricDataQueries: queries,
                    NextToken: nextToken,
                }),
            );
            (response.MetricDataResults || []).forEach((result) => {
                const instanceId = idToInstance.get(result.Id);
                if (!instanceId) {
                    return;
                }
                usageByInstance[instanceId] = latestMetricValue(result);
            });
            nextToken = response.NextToken;
        } while (nextToken);
    }

    return usageByInstance;
};
