import { Ec2NetworkOutDataGathererService } from './ec2NetworkOutDataGatherer.service';
import { getInstanceWithFilters } from '../../utils/aws/awsEc2.js';
import { getInstanceNetworkOutBytes } from '../../utils/aws/awsCloudWatch.js';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity.js';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto.js';
import { UsageEntity } from '../../usage/entities/usage.entity.js';

jest.mock('../../utils/aws/awsEc2.js', () => ({
    getInstanceWithFilters: jest.fn(),
}));
jest.mock('../../utils/aws/awsCloudWatch.js', () => ({
    getInstanceNetworkOutBytes: jest.fn(),
}));
jest.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: jest.fn(() => async () => ({
        accessKeyId: 'AKIATEST',
        secretAccessKey: 'secret',
        sessionToken: 'token',
    })),
}));
jest.mock('../../audit/audit.service.js', () => ({
    AuditService: { publishEvent: jest.fn() },
}));

describe('Ec2NetworkOutDataGathererService', () => {
    const service = new Ec2NetworkOutDataGathererService();
    const publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockReturnValue({
        message: 'published',
        id: 'id',
        data: [],
    });

    const jobBase = {
        data: {
            businessID: 'biz-1',
            subject: 'sub-1',
            rate: '*/5 * * * *',
            scheduleParameters: {
                iamRoleArn: 'arn:aws:iam::900000000001:role/meteringco-read-only',
                externalId: 'ext-1',
                dimensionId: 'dim-net',
                region: 'us-east-1',
                dimensionType: infrastructureType.instanceNetworkOut,
            },
        },
    } as any;

    beforeEach(() => {
        jest.clearAllMocks();
        publishSpy.mockClear();
    });

    it('aggregates outbound bytes per customer and ignores machines not opted into the dimension', async () => {
        (getInstanceWithFilters as jest.Mock).mockResolvedValue([
            {
                InstanceId: 'i-custA-1',
                State: { Name: 'running' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-net,other-dim' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-A' },
                ],
            },
            {
                InstanceId: 'i-custA-2',
                State: { Name: 'stopped' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-net' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-A' },
                ],
            },
            {
                InstanceId: 'i-custB-1',
                State: { Name: 'terminated' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-net' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-B' },
                ],
            },
            {
                InstanceId: 'i-wrong-dim',
                State: { Name: 'running' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'some-other-dim' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-C' },
                ],
            },
            {
                InstanceId: 'i-no-customer',
                State: { Name: 'running' },
                Tags: [{ Key: 'meteringcoDimensionId', Value: 'dim-net' }],
            },
        ]);
        (getInstanceNetworkOutBytes as jest.Mock).mockImplementation(async (_region, _creds, instanceId) => {
            const bytes = {
                'i-custA-1': 1500,
                'i-custA-2': 250,
                'i-custB-1': 4096,
            };
            return bytes[instanceId] ?? 0;
        });

        await service.readOperationJob(jobBase);

        expect(getInstanceWithFilters).toHaveBeenCalledWith('us-east-1', expect.anything(), [
            { Name: 'tag-key', Values: ['meteringcoDimensionId'] },
        ]);
        expect(getInstanceNetworkOutBytes).toHaveBeenCalledTimes(3);

        const published = publishSpy.mock.calls.map(([entity]) => ({
            customerId: entity.customerId,
            recordValue: entity.recordValue,
            dimensionId: entity.dimensionId,
            businessID: entity.businessID,
            measurement: entity._measurement,
        }));
        published.sort((a, b) => a.customerId.localeCompare(b.customerId));

        expect(published).toEqual([
            {
                customerId: 'cust-A',
                recordValue: 1750,
                dimensionId: 'dim-net',
                businessID: 'biz-1',
                measurement: UsageEntity._measurement,
            },
            {
                customerId: 'cust-B',
                recordValue: 4096,
                dimensionId: 'dim-net',
                businessID: 'biz-1',
                measurement: UsageEntity._measurement,
            },
        ]);
        expect(published.find((row) => row.customerId === 'cust-C')).toBeUndefined();
    });

    it('throws when the iam role is missing from the run', async () => {
        await expect(
            service.readOperationJob({
                data: { businessID: 'biz-1', scheduleParameters: { dimensionId: 'dim-net' } },
            } as any),
        ).rejects.toThrow('Iam role arn not found');
    });
});
