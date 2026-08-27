import {
    CloudWatchClient,
    GetMetricDataCommand,
    GetMetricStatisticsCommand,
    MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import { AwsCredentialIdentityProvider } from '@aws-sdk/types';

const awsClientOptions = (region: string, creds: AwsCredentialIdentityProvider | any) => ({
    region,
    credentials: creds,
    ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
});

const NETWORK_OUT_PERIOD_SECONDS = 300;

/**
 * Sum of AWS/EC2 NetworkOut (bytes leaving the instance) for each instance over [startTime, endTime].
 */
export const getInstancesNetworkOutBytes = async (
    region: string,
    creds: AwsCredentialIdentityProvider | any,
    instanceIds: string[],
    startTime: Date,
    endTime: Date,
): Promise<Record<string, number>> => {
    const totals: Record<string, number> = {};
    instanceIds.forEach((id) => {
        totals[id] = 0;
    });
    if (!instanceIds.length) {
        return totals;
    }

    const client = new CloudWatchClient(awsClientOptions(region, creds));
    await Promise.all(
        instanceIds.map(async (instanceId) => {
            totals[instanceId] = await getSingleInstanceNetworkOutBytes(client, instanceId, startTime, endTime);
        }),
    );

    const missing = instanceIds.filter((id) => totals[id] === 0);
    if (missing.length) {
        const fromMetricData = await getNetworkOutViaMetricData(client, missing, startTime, endTime);
        missing.forEach((id) => {
            if (fromMetricData[id]) {
                totals[id] = fromMetricData[id];
            }
        });
    }

    return totals;
};

const getSingleInstanceNetworkOutBytes = async (
    client: CloudWatchClient,
    instanceId: string,
    startTime: Date,
    endTime: Date,
): Promise<number> => {
    try {
        const response = await client.send(
            new GetMetricStatisticsCommand({
                Namespace: 'AWS/EC2',
                MetricName: 'NetworkOut',
                Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                StartTime: startTime,
                EndTime: endTime,
                Period: NETWORK_OUT_PERIOD_SECONDS,
                Statistics: ['Sum'],
            }),
        );
        return (response.Datapoints || []).reduce((acc, point) => acc + (point.Sum || 0), 0);
    } catch (err) {
        return 0;
    }
};

const getNetworkOutViaMetricData = async (
    client: CloudWatchClient,
    instanceIds: string[],
    startTime: Date,
    endTime: Date,
): Promise<Record<string, number>> => {
    const totals: Record<string, number> = {};
    const chunkSize = 100;
    for (let i = 0; i < instanceIds.length; i += chunkSize) {
        const chunk = instanceIds.slice(i, i + chunkSize);
        const queries: MetricDataQuery[] = chunk.map((instanceId, idx) => ({
            Id: `m${idx}`,
            Label: instanceId,
            MetricStat: {
                Metric: {
                    Namespace: 'AWS/EC2',
                    MetricName: 'NetworkOut',
                    Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                },
                Period: NETWORK_OUT_PERIOD_SECONDS,
                Stat: 'Sum',
            },
        }));
        try {
            const response = await client.send(
                new GetMetricDataCommand({
                    StartTime: startTime,
                    EndTime: endTime,
                    MetricDataQueries: queries,
                }),
            );
            (response.MetricDataResults || []).forEach((result) => {
                const instanceId = result.Label;
                if (!instanceId) {
                    return;
                }
                totals[instanceId] = (result.Values || []).reduce((acc, value) => acc + (value || 0), 0);
            });
        } catch (err) {
            // ignore and keep zeros
        }
    }
    return totals;
};
