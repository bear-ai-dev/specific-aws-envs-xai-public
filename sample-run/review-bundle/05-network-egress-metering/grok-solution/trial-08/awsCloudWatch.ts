import { CloudWatchClient, GetMetricDataCommand, MetricDataResult } from '@aws-sdk/client-cloudwatch';
import { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';

const NETWORK_OUT_METRIC = 'NetworkOut';
const EC2_NAMESPACE = 'AWS/EC2';
const MAX_QUERIES_PER_REQUEST = 500;

type CloudWatchCredentials = AwsCredentialIdentity | AwsCredentialIdentityProvider;

/**
 * Latest NetworkOut total (bytes) for a series in the queried window.
 * A series that published nothing is omitted; an observed zero is returned as 0.
 */
const latestMetricValue = (result: MetricDataResult): number | undefined => {
    const values = result.Values;
    const timestamps = result.Timestamps;
    if (!values || values.length === 0) {
        return undefined;
    }
    if (!timestamps || timestamps.length !== values.length) {
        return values[values.length - 1];
    }
    let latestIndex = 0;
    for (let index = 1; index < timestamps.length; index++) {
        if (timestamps[index] > timestamps[latestIndex]) {
            latestIndex = index;
        }
    }
    return values[latestIndex] ?? 0;
};

/**
 * AWS/EC2 NetworkOut (bytes leaving the instance) for the most recent period
 * in [startTime, endTime) for each instance. Instances with no observations
 * in the window are omitted from the map.
 */
export const getNetworkOutBytesByInstance = async (
    region: string,
    credentials: CloudWatchCredentials,
    instanceIds: string[],
    startTime: Date,
    endTime: Date,
    periodSeconds = 300,
): Promise<Map<string, number>> => {
    const totals = new Map<string, number>();
    if (!instanceIds.length) {
        return totals;
    }

    const client = new CloudWatchClient({ region, credentials });

    for (let offset = 0; offset < instanceIds.length; offset += MAX_QUERIES_PER_REQUEST) {
        const chunk = instanceIds.slice(offset, offset + MAX_QUERIES_PER_REQUEST);
        const queries = chunk.map((instanceId, index) => ({
            Id: `i${index}`,
            MetricStat: {
                Metric: {
                    Namespace: EC2_NAMESPACE,
                    MetricName: NETWORK_OUT_METRIC,
                    Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                },
                Period: periodSeconds,
                Stat: 'Sum' as const,
                Unit: 'Bytes' as const,
            },
            Label: instanceId,
            ReturnData: true,
        }));

        let nextToken: string | undefined;
        do {
            const response = await client.send(
                new GetMetricDataCommand({
                    StartTime: startTime,
                    EndTime: endTime,
                    MetricDataQueries: queries,
                    NextToken: nextToken,
                    ScanBy: 'TimestampDescending',
                }),
            );

            for (const result of response.MetricDataResults || []) {
                const instanceId = result.Label;
                const bytes = latestMetricValue(result);
                if (!instanceId || bytes === undefined) {
                    continue;
                }
                const existing = totals.get(instanceId);
                if (existing === undefined) {
                    totals.set(instanceId, bytes);
                }
            }
            nextToken = response.NextToken;
        } while (nextToken);
    }

    return totals;
};
