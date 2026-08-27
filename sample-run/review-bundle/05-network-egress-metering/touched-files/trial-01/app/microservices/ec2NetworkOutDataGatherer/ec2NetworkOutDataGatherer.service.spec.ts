import { Ec2NetworkOutDataGathererService } from './ec2NetworkOutDataGatherer.service.js';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity.js';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto.js';

jest.mock('../../utils/aws/awsEc2.js', () => ({
    getInstanceWithFilters: jest.fn(),
}));
jest.mock('../../utils/aws/awsCloudwatch.js', () => ({
    FIVE_MINUTES_IN_MS: 5 * 60 * 1000,
    getInstanceNetworkOutBytes: jest.fn(),
}));
jest.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: jest.fn(() => ({})),
}));

import { getInstanceWithFilters } from '../../utils/aws/awsEc2.js';
import { getInstanceNetworkOutBytes } from '../../utils/aws/awsCloudwatch.js';

const makeInstance = (id: string, tags: { Key: string; Value: string }[], state = 'stopped') => ({
    InstanceId: id,
    State: { Name: state },
    Tags: tags,
});

describe('Ec2NetworkOutDataGathererService', () => {
    const service = new Ec2NetworkOutDataGathererService();
    const publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockReturnValue({
        message: 'published',
        id: '1',
        data: [],
    } as any);

    const jobBase = {
        data: {
            businessID: 'biz-1',
            subject: 'sub-1',
            rate: '*/5 * * * *',
            scheduleParameters: {
                iamRoleArn: 'arn:aws:iam::900000000001:role/meteringco-read-only',
                externalId: 'ext-123',
                dimensionId: 'dim-egress',
                region: 'us-east-1',
                dimensionType: infrastructureType.instanceNetworkOut,
            },
        },
    } as any;

    beforeEach(() => {
        jest.clearAllMocks();
        publishSpy.mockClear();
    });

    it('sums outbound bytes per customer and ignores machines that are not tagged for the run', async () => {
        (getInstanceWithFilters as jest.Mock).mockResolvedValue([
            makeInstance('i-custA-1', [
                { Key: 'meteringcoDimensionId', Value: 'dim-egress,dim-other' },
                { Key: 'meteringcoCustomerId', Value: 'cust-a' },
            ]),
            makeInstance('i-custA-2', [
                { Key: 'meteringcoDimensionId', Value: 'dim-egress' },
                { Key: 'meteringcoCustomerId', Value: 'cust-a' },
            ]),
            makeInstance('i-custB-1', [
                { Key: 'meteringcoDimensionId', Value: 'dim-egress' },
                { Key: 'meteringcoCustomerId', Value: 'cust-b' },
            ]),
            makeInstance('i-wrong-dim', [
                { Key: 'meteringcoDimensionId', Value: 'dim-other' },
                { Key: 'meteringcoCustomerId', Value: 'cust-c' },
            ]),
            makeInstance('i-no-customer', [{ Key: 'meteringcoDimensionId', Value: 'dim-egress' }]),
            makeInstance(
                'i-stopped-still-owes',
                [
                    { Key: 'meteringcoDimensionId', Value: 'dim-egress' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-b' },
                ],
                'stopped',
            ),
        ]);
        (getInstanceNetworkOutBytes as jest.Mock).mockImplementation(async (_r, _c, instanceId) => {
            const map = {
                'i-custA-1': 100,
                'i-custA-2': 250,
                'i-custB-1': 40,
                'i-stopped-still-owes': 10,
            };
            return map[instanceId] ?? 0;
        });

        await service.readOperationJob(jobBase);

        expect(getInstanceWithFilters).toHaveBeenCalledWith('us-east-1', expect.anything(), []);
        const published = publishSpy.mock.calls.map(([entity]) => ({
            customerId: entity.customerId,
            recordValue: entity.recordValue,
            dimensionId: entity.dimensionId,
            businessID: entity.businessID,
        }));
        expect(published).toEqual(
            expect.arrayContaining([
                { customerId: 'cust-a', recordValue: 350, dimensionId: 'dim-egress', businessID: 'biz-1' },
                { customerId: 'cust-b', recordValue: 50, dimensionId: 'dim-egress', businessID: 'biz-1' },
            ]),
        );
        expect(published).toHaveLength(2);
        expect(published.find((p) => p.customerId === 'cust-c')).toBeUndefined();
    });

    it('throws when the role to assume is missing', async () => {
        await expect(
            service.readOperationJob({
                data: { ...jobBase.data, scheduleParameters: { dimensionId: 'x', region: 'us-east-1' } },
            } as any),
        ).rejects.toThrow('Iam role arn not found');
    });
});
