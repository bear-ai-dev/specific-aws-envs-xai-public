import { Ec2NetworkOutDataGathererService } from './ec2NetworkOutDataGatherer.service';
import { getInstanceWithFilters } from '../../utils/aws/awsEc2';
import { getNetworkOutBytesByInstance } from '../../utils/aws/awsCloudWatch';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto';

jest.mock('../../utils/aws/awsEc2');
jest.mock('../../utils/aws/awsCloudWatch');
jest.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: jest.fn(() => async () => ({
        accessKeyId: 'test',
        secretAccessKey: 'test',
    })),
}));

describe('Ec2NetworkOutDataGathererService', () => {
    const service = new Ec2NetworkOutDataGathererService();
    const publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockReturnValue({
        message: 'published',
        id: '00000000-0000-0000-0000-000000000000',
        data: [],
    });

    const job = {
        data: {
            businessID: 'biz-1',
            subject: 'sub',
            rate: '*/5 * * * *',
            scheduleParameters: {
                iamRoleArn: 'arn:aws:iam::123456789012:role/meteringco-scraper',
                externalId: 'ext-1',
                dimensionId: 'dim-out',
                region: 'us-east-1',
                dimensionType: infrastructureType.instanceNetworkOut,
            },
        },
    } as any;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('aggregates outbound bytes per customer and ignores untagged or mismatched machines', async () => {
        (getInstanceWithFilters as jest.Mock).mockResolvedValue([
            {
                InstanceId: 'i-a',
                State: { Name: 'stopped' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-out,other-dim' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-1' },
                ],
            },
            {
                InstanceId: 'i-b',
                State: { Name: 'running' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-out' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-1' },
                ],
            },
            {
                InstanceId: 'i-c',
                State: { Name: 'running' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'dim-out' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-2' },
                ],
            },
            {
                InstanceId: 'i-d',
                State: { Name: 'running' },
                Tags: [{ Key: 'meteringcoDimensionId', Value: 'dim-out' }],
            },
            {
                InstanceId: 'i-e',
                State: { Name: 'running' },
                Tags: [
                    { Key: 'meteringcoDimensionId', Value: 'other-dim' },
                    { Key: 'meteringcoCustomerId', Value: 'cust-1' },
                ],
            },
        ]);
        (getNetworkOutBytesByInstance as jest.Mock).mockResolvedValue({
            'i-a': 100,
            'i-b': 250.5,
            'i-c': 40,
        });

        await service.readOperationJob(job);

        expect(getInstanceWithFilters).toHaveBeenCalledWith('us-east-1', expect.anything(), []);
        expect(getNetworkOutBytesByInstance).toHaveBeenCalledWith('us-east-1', expect.anything(), [
            'i-a',
            'i-b',
            'i-c',
        ]);
        expect(publishSpy).toHaveBeenCalledTimes(2);
        const published = publishSpy.mock.calls.map(([entity]) => ({
            customerId: entity.customerId,
            recordValue: entity.recordValue,
            dimensionId: entity.dimensionId,
            businessID: entity.businessID,
        }));
        expect(published).toEqual(
            expect.arrayContaining([
                { customerId: 'cust-1', recordValue: 350.5, dimensionId: 'dim-out', businessID: 'biz-1' },
                { customerId: 'cust-2', recordValue: 40, dimensionId: 'dim-out', businessID: 'biz-1' },
            ]),
        );
    });

    it('throws when the iam role is missing', async () => {
        await expect(
            service.readOperationJob({
                data: { scheduleParameters: {}, businessID: 'biz-1' },
            } as any),
        ).rejects.toBeTruthy();
    });
});
