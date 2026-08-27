import { TokenConsumer } from './token-consumer.entity';
import { MeteringCoToken } from '../dto/meteringcoToken.dto';

describe('TokenConsumer', () => {
    const influxService = {
        getPoint: jest.fn(),
    };

    beforeEach(() => {
        const point = {
            timestamp: jest.fn().mockReturnThis(),
            tag: jest.fn().mockReturnThis(),
            floatField: jest.fn().mockReturnThis(),
            intField: jest.fn().mockReturnThis(),
        };
        influxService.getPoint.mockReturnValue(point);
    });

    it('writes a call at the moment it happened, with customer, account and amount', () => {
        const token = new MeteringCoToken({
            businessID: 'tenant-1',
            tokenAmount: '2',
            timestamp: '2024-01-01T01:23:45.000Z',
            metadata: { tokenType: 'apiCall' as any, path: '/usage' },
        });
        const entity = new TokenConsumer(token, 'cust-1', 'meteringco-production');
        const [point] = TokenConsumer.transformer(entity, influxService as any);
        expect(influxService.getPoint).toHaveBeenCalledWith('tokenConsumer');
        expect(point.timestamp).toHaveBeenCalledWith(new Date('2024-01-01T01:23:45.000Z'));
        expect(point.tag).toHaveBeenCalledWith('customerId', 'cust-1');
        expect(point.tag).toHaveBeenCalledWith('businessID', 'meteringco-production');
        expect(point.floatField).toHaveBeenCalledWith('tokenAmount', 2);
        expect(point.tag).toHaveBeenCalledWith('tokenType', 'apiCall');
    });

    it('marks a closed period so a late arrival cannot reopen it', () => {
        const [point] = TokenConsumer.periodCloseTransformer(
            {
                customerId: 'cust-1',
                businessID: 'meteringco-production',
                startDate: new Date('2024-01-01T00:00:00.000Z'),
                endDate: new Date('2024-01-01T06:00:00.000Z'),
            },
            influxService as any,
        );
        expect(influxService.getPoint).toHaveBeenCalledWith('tokenPeriodClose');
        expect(point.timestamp).toHaveBeenCalledWith(new Date('2024-01-01T00:00:00.000Z'));
        expect(point.tag).toHaveBeenCalledWith('startDate', '2024-01-01T00:00:00.000Z');
        expect(point.intField).toHaveBeenCalledWith('closed', 1);
    });
});
