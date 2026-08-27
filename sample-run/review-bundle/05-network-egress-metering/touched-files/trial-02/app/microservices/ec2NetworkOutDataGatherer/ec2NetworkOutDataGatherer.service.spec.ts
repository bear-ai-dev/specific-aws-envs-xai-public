import { Ec2NetworkOutDataGathererService } from './ec2NetworkOutDataGatherer.service';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity';
import { UsageEntity } from '../../usage/entities/usage.entity';

jest.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: jest.fn(() => ({ mocked: 'creds' })),
}));
jest.mock('../../utils/aws/awsEc2.js', () => ({
    getInstanceWithFilters: jest.fn(),
}));
jest.mock('../../utils/aws/awsCloudWatch.js', () => ({
    getInstanceNetworkOutBytes: jest.fn(),
}));
jest.mock('../../audit/audit.service.js', () => ({
    AuditService: { publishEvent: jest.fn() },
}));

import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getInstanceWithFilters } from '../../utils/aws/awsEc2.js';
import { getInstanceNetworkOutBytes } from '../../utils/aws/awsCloudWatch.js';

const makeInstance = (id: string, tags: Record<string, string>, state = 'running') => ({
    InstanceId: id,
    State: { Name: state },
    Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
});

describe('Ec2NetworkOutDataGathererService', () => {
    const service = new Ec2NetworkOutDataGathererService();
    const publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockReturnValue({
        message: 'published',
        id: 'id',
        data: [],
    });

    beforeEach(() => {
        jest.clearAllMocks();
        publishSpy.mockClear();
    });

    const job = {
        data: {
            businessID: 'biz-1',
            subject: 'sub-1',
            rate: 'everyFiveMinutes',
            scheduleParameters: {
                iamRoleArn: 'arn:aws:iam::123:role/meter',
                externalId: 'ext-99',
                dimensionId: 'dim-net',
                region: 'us-west-2',
                dimensionType: infrastructureType.instanceNetworkOut,
            },
        },
    } as any;

    it('aggregates outbound bytes per customer and ignores untagged or unmatched machines', async () => {
        (getInstanceWithFilters as jest.Mock).mockResolvedValue([
            makeInstance('i-custA-1', { meteringcoDimensionId: 'dim-net,other', meteringcoCustomerId: 'cust-A' }),
            makeInstance('i-custA-2', { meteringcoDimensionId: 'dim-net', meteringcoCustomerId: 'cust-A' }, 'stopped'),
            makeInstance('i-custB-1', { meteringcoDimensionId: 'dim-net', meteringcoCustomerId: 'cust-B' }, 'terminated'),
            makeInstance('i-wrong-dim', { meteringcoDimensionId: 'other-dim', meteringcoCustomerId: 'cust-A' }),
            makeInstance('i-no-customer', { meteringcoDimensionId: 'dim-net' }),
        ]);
        (getInstanceNetworkOutBytes as jest.Mock).mockImplementation(async (_region, _creds, instanceId) => {
            const values = { 'i-custA-1': 111, 'i-custA-2': 222, 'i-custB-1': 333 };
            return values[instanceId];
        });

        await service.readOperationJob(job);

        expect(fromTemporaryCredentials).toHaveBeenCalledWith({
            params: { RoleArn: 'arn:aws:iam::123:role/meter', ExternalId: 'ext-99' },
            clientConfig: { region: 'us-east-1' },
        });
        expect(getInstanceWithFilters).toHaveBeenCalledWith(
            'us-west-2',
            { mocked: 'creds' },
            [{ Name: 'tag-key', Values: ['meteringcoDimensionId'] }],
        );
        expect(getInstanceNetworkOutBytes).toHaveBeenCalledTimes(3);
        expect(publishSpy).toHaveBeenCalledTimes(2);
        const published = publishSpy.mock.calls.map(([entity]) => entity);
        const byCustomer = Object.fromEntries(published.map((e) => [e.customerId, e]));
        expect(byCustomer['cust-A'].recordValue).toBe(333);
        expect(byCustomer['cust-A'].dimensionId).toBe('dim-net');
        expect(byCustomer['cust-A'].businessID).toBe('biz-1');
        expect(byCustomer['cust-A']._measurement).toBe(UsageEntity._measurement);
        expect(byCustomer['cust-B'].recordValue).toBe(333);
    });

    it('throws when the role is missing from the run', async () => {
        await expect(
            service.readOperationJob({ data: { scheduleParameters: {}, businessID: 'biz-1' } } as any),
        ).rejects.toBeTruthy();
        expect(publishSpy).not.toHaveBeenCalled();
    });
});
