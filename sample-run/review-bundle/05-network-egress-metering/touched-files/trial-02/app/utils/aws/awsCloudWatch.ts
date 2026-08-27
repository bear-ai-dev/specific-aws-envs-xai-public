import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

const FIVE_MINUTES_IN_SECONDS = 300;

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
            Namespace: 'AWS/EC2',
            MetricName: 'NetworkOut',
            Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
            StartTime: startTime,
            EndTime: endTime,
            Period: FIVE_MINUTES_IN_SECONDS,
            Statistics: ['Sum'],
            Unit: 'Bytes',
        }),
    );
    return (response.Datapoints || []).reduce((acc, datapoint) => acc + (datapoint.Sum || 0), 0);
};
