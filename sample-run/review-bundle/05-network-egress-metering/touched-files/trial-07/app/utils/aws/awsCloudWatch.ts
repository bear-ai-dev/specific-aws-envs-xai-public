import {
    CloudWatchClient,
    GetMetricDataCommand,
    MetricDataQuery,
    StandardUnit,
} from '@aws-sdk/client-cloudwatch';

const NETWORK_OUT_QUERY_CHUNK = 500;

/**
 * Sum AWS/EC2 NetworkOut (bytes leaving the instance) for each instance over the
 * given window. Instances with no observations in the window are omitted rather
 * than reported as zero; an instance that published zeros is reported as 0.
 */
export const getNetworkOutBytesByInstance = async (
    region: string,
    creds,
    instanceIds: string[],
    startTime: Date,
    endTime: Date,
    period = 300,
): Promise<Record<string, number>> => {
    if (!instanceIds.length) {
        return {};
    }
    const client = new CloudWatchClient({ region, credentials: creds });
    const totals: Record<string, number> = {};

    for (let offset = 0; offset < instanceIds.length; offset += NETWORK_OUT_QUERY_CHUNK) {
        const chunk = instanceIds.slice(offset, offset + NETWORK_OUT_QUERY_CHUNK);
        const MetricDataQueries: MetricDataQuery[] = chunk.map((instanceId, idx) => ({
            Id: `m${offset + idx}`,
            MetricStat: {
                Metric: {
                    Namespace: 'AWS/EC2',
                    MetricName: 'NetworkOut',
                    Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                },
                Period: period,
                Stat: 'Sum',
                Unit: StandardUnit.Bytes,
            },
        }));

        let nextToken: string | undefined;
        do {
            const response = await client.send(
                new GetMetricDataCommand({
                    StartTime: startTime,
                    EndTime: endTime,
                    NextToken: nextToken,
                    MetricDataQueries,
                }),
            );
            for (const result of response.MetricDataResults || []) {
                if (!result.Id || !result.Values || result.Values.length === 0) {
                    continue;
                }
                const instanceIndex = Number(result.Id.slice(1));
                const instanceId = instanceIds[instanceIndex];
                if (!instanceId) {
                    continue;
                }
                const sum = result.Values.reduce((acc, value) => acc + (value ?? 0), 0);
                totals[instanceId] = (totals[instanceId] ?? 0) + sum;
            }
            nextToken = response.NextToken;
        } while (nextToken);
    }

    return totals;
};
