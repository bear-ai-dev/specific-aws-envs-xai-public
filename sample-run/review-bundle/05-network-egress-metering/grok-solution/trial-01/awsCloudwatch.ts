import { CloudWatchClient, GetMetricStatisticsCommand, Statistic } from '@aws-sdk/client-cloudwatch';

export const NETWORK_OUT_METRIC = 'NetworkOut';
export const EC2_NAMESPACE = 'AWS/EC2';
export const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
export const FIVE_MINUTES_IN_SECONDS = 300;

export const getInstanceNetworkOutBytes = async (
    region: string,
    creds,
    instanceId: string,
    startTime: Date,
    endTime: Date,
): Promise<number> => {
    const cloudWatchClient = new CloudWatchClient({ region, credentials: creds });
    const response = await cloudWatchClient.send(
        new GetMetricStatisticsCommand({
            Namespace: EC2_NAMESPACE,
            MetricName: NETWORK_OUT_METRIC,
            Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
            StartTime: startTime,
            EndTime: endTime,
            Period: FIVE_MINUTES_IN_SECONDS,
            Statistics: [Statistic.Sum],
        }),
    );
    const datapoints = response.Datapoints ?? [];
    return datapoints.reduce((total, datapoint) => total + (datapoint.Sum ?? 0), 0);
};
