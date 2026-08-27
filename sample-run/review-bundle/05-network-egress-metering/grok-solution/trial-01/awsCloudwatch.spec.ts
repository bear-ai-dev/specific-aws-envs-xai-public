import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { getInstanceNetworkOutBytes, FIVE_MINUTES_IN_SECONDS } from './awsCloudwatch.js';

jest.mock('@aws-sdk/client-cloudwatch', () => {
    const send = jest.fn();
    return {
        CloudWatchClient: jest.fn(() => ({ send })),
        GetMetricStatisticsCommand: jest.fn(function (input) {
            this.input = input;
        }),
        Statistic: { Sum: 'Sum' },
    };
});

describe('getInstanceNetworkOutBytes', () => {
    const send = new CloudWatchClient({} as any).send as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        (CloudWatchClient as unknown as jest.Mock).mockImplementation(() => ({ send }));
    });

    it('sums CloudWatch NetworkOut datapoints without converting units', async () => {
        send.mockResolvedValue({
            Datapoints: [{ Sum: 1234 }, { Sum: 4321 }, { Timestamp: new Date() }],
        });
        const start = new Date('2026-08-27T00:00:00Z');
        const end = new Date('2026-08-27T00:05:00Z');
        const total = await getInstanceNetworkOutBytes('us-east-1', { accessKeyId: 'x' }, 'i-abc', start, end);
        expect(total).toBe(5555);
        expect(GetMetricStatisticsCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                Namespace: 'AWS/EC2',
                MetricName: 'NetworkOut',
                Dimensions: [{ Name: 'InstanceId', Value: 'i-abc' }],
                Period: FIVE_MINUTES_IN_SECONDS,
                Statistics: ['Sum'],
                StartTime: start,
                EndTime: end,
            }),
        );
    });

    it('returns 0 when CloudWatch has no datapoints', async () => {
        send.mockResolvedValue({ Datapoints: [] });
        const total = await getInstanceNetworkOutBytes(
            'us-east-1',
            {},
            'i-none',
            new Date(),
            new Date(),
        );
        expect(total).toBe(0);
    });
});
