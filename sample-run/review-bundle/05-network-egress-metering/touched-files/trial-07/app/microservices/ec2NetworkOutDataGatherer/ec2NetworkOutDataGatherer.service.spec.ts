import { Ec2NetworkOutDataGathererService } from './ec2NetworkOutDataGatherer.service';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto';
import { readFileSync } from 'fs';

const recorded = JSON.parse(readFileSync('/opt/billing-sandbox/recorded-usage.json', 'utf8'));

describe('Ec2NetworkOutDataGathererService', () => {
    const service = new Ec2NetworkOutDataGathererService();

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('charges each customer the bytes their machines sent out on the dimension', async () => {
        const published = [];
        const publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockImplementation((entity) => {
            published.push(entity);
            return { message: 'published', id: 'x', data: [entity] };
        });

        await service.readOperationJob({
            data: {
                businessID: 'biz-northwind',
                subject: 'test',
                rate: 'everyFiveMinutes',
                scheduleParameters: {
                    iamRoleArn: 'arn:aws:iam::100000000031:role/meteringco-egress-reader',
                    externalId: 'nw-sbx-4417',
                    dimensionId: 'dim_sbx_egress',
                    region: 'us-east-1',
                    dimensionType: infrastructureType.instanceNetworkOut,
                },
            },
        } as any);

        publishSpy.mockRestore();

        const byCustomer = Object.fromEntries(published.map((row) => [row.customerId, row.recordValue]));
        const expected = Object.fromEntries(recorded.rows.map((row) => [row.customerId, row.recordValue]));
        expect(byCustomer).toEqual(expected);
        expect(published.every((row) => row.dimensionId === 'dim_sbx_egress')).toBe(true);
        expect(published.every((row) => row.businessID === 'biz-northwind')).toBe(true);
        expect(published.some((row) => row.customerId === 'cus_pellucid')).toBe(false);
        expect(published.some((row) => row.customerId === 'cus_offledger')).toBe(false);
    });

    it('includes a machine whose dimension list contains the run among several', async () => {
        const published = [];
        const publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockImplementation((entity) => {
            published.push(entity);
            return { message: 'published', id: 'x', data: [entity] };
        });

        await service.readOperationJob({
            data: {
                businessID: 'biz-northwind',
                subject: 'test',
                rate: 'everyFiveMinutes',
                scheduleParameters: {
                    iamRoleArn: 'arn:aws:iam::100000000031:role/meteringco-egress-reader',
                    externalId: 'nw-sbx-4417',
                    dimensionId: 'dim_sbx_archive',
                    region: 'us-east-1',
                    dimensionType: infrastructureType.instanceNetworkOut,
                },
            },
        } as any);

        publishSpy.mockRestore();

        const byCustomer = Object.fromEntries(published.map((row) => [row.customerId, row.recordValue]));
        expect(byCustomer).toEqual({
            cus_stanchion: 250000,
            cus_offledger: 3300000,
        });
    });
});
