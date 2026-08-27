import { Ec2NetworkOutDataGathererService } from './ec2NetworkOutDataGatherer.service';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity.js';
import { UsageEntity } from '../../usage/entities/usage.entity.js';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto.js';

jest.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: jest.fn(() => ({ accessKeyId: 'AKIATEST', secretAccessKey: 'secret' })),
}));

const getInstanceWithFilters = jest.fn();
jest.mock('../../utils/aws/awsEc2.js', () => ({
    getInstanceWithFilters: (...args: unknown[]) => getInstanceWithFilters(...args),
}));

const getInstancesNetworkOutBytes = jest.fn();
jest.mock('../../utils/aws/awsCloudWatch.js', () => ({
    getInstancesNetworkOutBytes: (...args: unknown[]) => getInstancesNetworkOutBytes(...args),
}));

describe('Ec2NetworkOutDataGathererService', () => {
    const service = new Ec2NetworkOutDataGathererService();
    const publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockReturnValue({
        message: 'published',
        id: 'id',
        data: [],
    });

    const job = {
        data: {
            businessID: 'biz-1',
            subject: 'sub-1',
            rate: '*/5 * * * *',
            scheduleParameters: {
                iamRoleArn: 'arn:aws:iam::900000000001:role/meteringco-read-only',
                externalId: 'ext-123',
                dimensionId: 'dim-net',
                region: 'us-east-1',
                dimensionType: infrastructureType.instanceNetworkOut,
            },
        },
    } as any;

    beforeEach(() => {
        publishSpy.mockClear();
        getInstanceWithFilters.mockReset();
        getInstancesNetworkOutBytes.mockReset();
    });

    it('aggregates outbound bytes per customer and skips machines that did not opt in', async () => {
        getInstanceWithFilters.mockResolvedValue([
            {
                InstanceId: 'i-custA-1',
                State: { Name: 'running' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-net,dim-other' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-a' },
                ],
            },
            {
                InstanceId: 'i-custA-2',
                State: { Name: 'stopped' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-net' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-a' },
                ],
            },
            {
                InstanceId: 'i-custB-1',
                State: { Name: 'terminated' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-net' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-b' },
                ],
            },
            {
                InstanceId: 'i-wrong-dim',
                State: { Name: 'running' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-other' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-a' },
                ],
            },
            {
                InstanceId: 'i-no-customer',
                State: { Name: 'running' },
                Tags: [{ Key: 'meteringcoDimensionId', Value: 'dim-net' }],
            },
        ]);
        getInstancesNetworkOutBytes.mockResolvedValue({
            'i-custA-1': 1111,
            'i-custA-2': 2222,
            'i-custB-1': 3333,
        });

        await service.readOperationJob(job);

        expect(getInstanceWithFilters).toHaveBeenCalled();
        const [, , filters] = getInstanceWithFilters.mock.calls[0];
        expect(JSON.stringify(filters)).not.toContain('instance-state-name');

        expect(getInstancesNetworkOutBytes).toHaveBeenCalled();
        const requestedIds = getInstancesNetworkOutBytes.mock.calls[0][2].sort();
        expect(requestedIds).toEqual(['i-custA-1', 'i-custA-2', 'i-custB-1']);

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
                customerId: 'cust-a',
                recordValue: 3333,
                dimensionId: 'dim-net',
                businessID: 'biz-1',
                measurement: UsageEntity._measurement,
            },
            {
                customerId: 'cust-b',
                recordValue: 3333,
                dimensionId: 'dim-net',
                businessID: 'biz-1',
                measurement: UsageEntity._measurement,
            },
        ]);
    });

    it('publishes nothing when no machines match the run dimension', async () => {
        getInstanceWithFilters.mockResolvedValue([
            {
                InstanceId: 'i-1',
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'other' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-a' },
                ],
            },
        ]);

        await service.readOperationJob(job);

        expect(getInstancesNetworkOutBytes).not.toHaveBeenCalled();
        expect(publishSpy).not.toHaveBeenCalled();
    });
});
