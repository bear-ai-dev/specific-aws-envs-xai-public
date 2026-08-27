import { GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { getInstanceNetworkOutBytes } from './awsCloudWatch';

const sendMock = jest.fn();
jest.mock('@aws-sdk/client-cloudwatch', () => {
    const actual = jest.requireActual('@aws-sdk/client-cloudwatch');
    return {
        ...actual,
        CloudWatchClient: jest.fn().mockImplementation(() => ({
            send: sendMock,
        })),
    };
});

describe('getInstanceNetworkOutBytes', () => {
    beforeEach(() => {
        sendMock.mockReset();
    });

    it('sums NetworkOut datapoints without converting units', async () => {
        sendMock.mockResolvedValue({
            Datapoints: [{ Sum: 1234 }, { Sum: 66 }, { Sum: undefined }],
        });
        const endTime = new Date('2026-08-27T00:10:00.000Z');
        const total = await getInstanceNetworkOutBytes(
            'us-east-1',
            { accessKeyId: 'a', secretAccessKey: 'b' },
            'i-abc',
            endTime,
            5 * 60 * 1000,
        );
        expect(total).toBe(1300);
        expect(sendMock).toHaveBeenCalledTimes(1);
        const command = sendMock.mock.calls[0][0] as GetMetricStatisticsCommand;
        expect(command.input.Namespace).toBe('AWS/EC2');
        expect(command.input.MetricName).toBe('NetworkOut');
        expect(command.input.Statistics).toEqual(['Sum']);
        expect(command.input.Period).toBe(300);
        expect(command.input.Dimensions).toEqual([{ Name: 'InstanceId', Value: 'i-abc' }]);
        expect(command.input.EndTime).toEqual(endTime);
        expect(command.input.StartTime).toEqual(new Date(endTime.getTime() - 5 * 60 * 1000));
    });

    it('returns 0 when CloudWatch has no datapoints', async () => {
        sendMock.mockResolvedValue({ Datapoints: [] });
        const total = await getInstanceNetworkOutBytes(
            'us-east-1',
            { accessKeyId: 'a', secretAccessKey: 'b' },
            'i-empty',
        );
        expect(total).toBe(0);
    });
});
