import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { Logger } from '@nestjs/common';

const logger = new Logger('awsCloudWatch');

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
const FIVE_MINUTES_IN_SECONDS = 300;

export const getInstanceNetworkOutBytes = async (
    region: string,
    creds: AwsCredentialIdentity | AwsCredentialIdentityProvider,
    instanceId: string,
    endTime: Date = new Date(),
    intervalMs: number = FIVE_MINUTES_IN_MS,
): Promise<number> => {
    const cloudWatchClient = new CloudWatchClient({ region, credentials: creds });
    const startTime = new Date(endTime.getTime() - intervalMs);
    try {
        const response = await cloudWatchClient.send(
            new GetMetricStatisticsCommand({
                Namespace: 'AWS/EC2',
                MetricName: 'NetworkOut',
                Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
                StartTime: startTime,
                EndTime: endTime,
                Period: FIVE_MINUTES_IN_SECONDS,
                Statistics: ['Sum'],
            }),
        );
        return (response.Datapoints || []).reduce((acc, datapoint) => acc + (datapoint.Sum || 0), 0);
    } catch (err) {
        logger.error(`Error fetching NetworkOut for instance ${instanceId}`, err);
        throw err;
    }
};
