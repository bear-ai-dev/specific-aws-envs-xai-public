import { TokenConsumerService } from './token-consumer.service';
import { TokenConsumer } from './entities/token-consumer.entity';
import { TokenConsumerAsyncProcessor } from './token-consumer-async-processor';
import { TokenType } from './dto/TokenType';
import { cache as cacheManager } from '../cacheStore.js';

describe('TokenConsumer metering path', () => {
    const influxService = {
        loadPoints: jest.fn().mockResolvedValue(undefined),
        getPoint: jest.fn(() => {
            const point: any = {
                tag: jest.fn().mockReturnThis(),
                timestamp: jest.fn().mockReturnThis(),
                floatField: jest.fn().mockReturnThis(),
            };
            return point;
        }),
        aggregateMeteringCoToken: jest.fn(),
    };
    const environmentService = {
        getEnvironmentsForUser: jest.fn(),
    };
    const schedulerService = {
        create: jest.fn(),
        remove: jest.fn(),
    };
    const localJWTAuthService = {
        signIn: jest.fn(),
    };

    let service: TokenConsumerService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new TokenConsumerService(
            schedulerService as any,
            localJWTAuthService as any,
            environmentService as any,
            influxService as any,
        );
    });

    it('registerCall writes to the aggregate bucket without flushing', async () => {
        const customer = {
            customerId: 'cust-1',
            businessID: 'meteringco-production',
            metadata: { businessID: 'tenant-prod' },
        };
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: customer as any,
        });

        const moment = '2024-01-01T01:02:03.000Z';
        await TokenConsumerService.registerCall({
            businessID: 'tenant-prod',
            tokenAmount: '1',
            timestamp: moment,
            metadata: { tokenType: TokenType.apiCall },
            environmentService: environmentService as any,
            influxService: influxService as any,
        });

        expect(influxService.loadPoints).toHaveBeenCalledTimes(1);
        const [bucket, , points, flush] = influxService.loadPoints.mock.calls[0];
        expect(bucket).toBe(TokenConsumerAsyncProcessor.tokenAggregateBucket);
        expect(flush).toBe(false);
        expect(points).toHaveLength(1);
        expect(influxService.getPoint).toHaveBeenCalledWith(TokenConsumer._measurement);
        const point = influxService.getPoint.mock.results[0].value;
        expect(point.timestamp).toHaveBeenCalledWith(new Date(moment));
        expect(point.tag).toHaveBeenCalledWith('customerId', 'cust-1');
        expect(point.tag).toHaveBeenCalledWith('businessID', 'meteringco-production');
        expect(point.floatField).toHaveBeenCalledWith('recordValue', 1);
    });

    it('registerCall records a late arrival at its own moment', async () => {
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: { customerId: 'cust-1', businessID: 'meteringco-production' } as any,
        });
        const lateMoment = '2023-12-31T18:00:00.000Z';
        await service.registerCall({
            businessID: 'tenant-prod',
            tokenAmount: '1',
            timestamp: lateMoment,
            metadata: { tokenType: TokenType.apiCall },
        });
        const point = influxService.getPoint.mock.results[0].value;
        expect(point.timestamp).toHaveBeenCalledWith(new Date(lateMoment));
        expect(influxService.loadPoints.mock.calls[0][3]).toBe(false);
    });

    it('closePeriod totals a window and bills once via create()', async () => {
        const customer = {
            customerId: 'cust-1',
            businessID: 'meteringco-production',
            metadata: { businessID: 'tenant-prod' },
            offering: {
                dimensions: [{ dimensionId: 'dim-api', dimensionName: 'apiCall', metadata: { tokenType: 'apiCall' } }],
            },
        };
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: customer as any,
        });
        influxService.aggregateMeteringCoToken.mockResolvedValue([{ _value: 4 }, { _value: 6 }]);
        const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ message: 'ok' });
        const start = '2024-01-01T00:00:00.000Z';
        const end = '2024-01-01T06:00:00.000Z';
        await cacheManager.del(TokenConsumerService.closedPeriodCacheKey('cust-1', start, end));

        await service.closePeriod({
            businessID: 'tenant-prod',
            startDate: start,
            endDate: end,
        });

        expect(influxService.aggregateMeteringCoToken).toHaveBeenCalledWith({
            customerId: 'cust-1',
            startDate: new Date(start),
            endDate: new Date(end),
        });
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(createSpy.mock.calls[0][0].tokenAmount).toBe('10');
        expect(createSpy.mock.calls[0][0].metadata.tokenType).toBe(TokenType.apiCall);

        createSpy.mockClear();
        influxService.aggregateMeteringCoToken.mockClear();
        await service.closePeriod({
            businessID: 'tenant-prod',
            startDate: start,
            endDate: end,
        });
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('records a late arrival after close without re-billing the closed period', async () => {
        const customer = {
            customerId: 'cust-1',
            businessID: 'meteringco-production',
            metadata: { businessID: 'tenant-prod' },
            offering: {
                dimensions: [{ dimensionId: 'dim-api', dimensionName: 'apiCall', metadata: { tokenType: 'apiCall' } }],
            },
        };
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: customer as any,
        });
        influxService.aggregateMeteringCoToken.mockResolvedValue([{ _value: 3 }]);
        const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ message: 'ok' });
        const start = '2024-02-01T00:00:00.000Z';
        const end = '2024-02-01T06:00:00.000Z';
        await cacheManager.del(TokenConsumerService.closedPeriodCacheKey('cust-1', start, end));

        await service.closePeriod({ businessID: 'tenant-prod', startDate: start, endDate: end });
        expect(createSpy).toHaveBeenCalledTimes(1);
        createSpy.mockClear();

        const lateMoment = '2024-02-01T03:00:00.000Z';
        await service.registerCall({
            businessID: 'tenant-prod',
            tokenAmount: '1',
            timestamp: lateMoment,
            metadata: { tokenType: TokenType.apiCall },
        });
        const point = influxService.getPoint.mock.results.at(-1).value;
        expect(point.timestamp).toHaveBeenCalledWith(new Date(lateMoment));

        await service.closePeriod({ businessID: 'tenant-prod', startDate: start, endDate: end });
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('resolvePlatformAccount picks production vs sandbox', () => {
        const prod = TokenConsumerService.resolvePlatformAccount({
            businessID: 'meteringco-production',
            offering: { dimensions: [{ dimensionId: 'prod-dim', dimensionName: 'apiCall' }] },
        } as any);
        expect(prod.businessID).toBe('meteringco-production');
        expect(prod.dimensionId).toBe('prod-dim');

        const sandbox = TokenConsumerService.resolvePlatformAccount({
            businessID: 'meteringco-sandbox',
            offering: { dimensions: [{ dimensionId: 'sand-dim', dimensionName: 'apiCall' }] },
        } as any);
        expect(sandbox.businessID).toBe('meteringco-sandbox');
        expect(sandbox.dimensionId).toBe('sand-dim');
    });
});
