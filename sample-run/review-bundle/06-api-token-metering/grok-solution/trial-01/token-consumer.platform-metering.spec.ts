import { TokenConsumerService } from './token-consumer.service';
import { TokenConsumer } from './entities/token-consumer.entity';
import { TokenType } from './dto/TokenType';
import { MeteringCoToken } from './dto/meteringcoToken.dto';
import { TokenConsumerAsyncProcessor } from './token-consumer-async-processor';
import { DatetimeUtils } from '../utils/datetime';
import { InfluxService } from '../influx/influx.service';

describe('TokenConsumer platform API metering', () => {
    const influxService = {
        loadPoints: jest.fn().mockResolvedValue(undefined),
        getPoint: jest.fn(() => {
            const point: any = {
                tag: jest.fn(() => point),
                floatField: jest.fn(() => point),
                timestamp: jest.fn(() => point),
            };
            return point;
        }),
        aggregateMeteringCoToken: jest.fn(),
    };
    const usageService = {
        create: jest.fn().mockResolvedValue({ message: 'Measurement created' }),
    };
    const environmentService = {
        getEnvironmentsForUser: jest.fn(),
    };
    let service: TokenConsumerService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new TokenConsumerService(
            {} as any,
            {} as any,
            environmentService as any,
            influxService as any,
            usageService as any,
        );
    });

    it('registers a call against the platform customer without flushing', async () => {
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: { customerId: 'cust-1', businessID: 'meteringco-production' } as any,
        });

        await service.registerCall({
            businessID: 'tenant-production',
            subject: 'user-1',
            amount: '1',
            timestamp: '2024-01-01T00:00:00.000Z',
            metadata: { path: '/usage', method: 'POST' },
        });

        expect(influxService.loadPoints).toHaveBeenCalledWith(
            TokenConsumerAsyncProcessor.tokenAggregateBucket,
            undefined,
            expect.any(Array),
            false,
        );
    });

    it('does not register the platform billing itself', async () => {
        const spy = jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId');
        await service.registerCall({
            businessID: 'meteringco-production',
            amount: '1',
        });
        expect(spy).not.toHaveBeenCalled();
        expect(influxService.loadPoints).not.toHaveBeenCalled();
    });

    it('closes the previous six hours when no window is given', () => {
        const now = new Date('2024-01-01T12:00:00.000Z');
        const window = TokenConsumerService.resolveWindow(undefined, now);
        expect(window.endDate.toISOString()).toBe(now.toISOString());
        expect(window.startDate.toISOString()).toBe(DatetimeUtils.sixHoursAgo(now).toISOString());
    });

    it('bills an aggregated period as a single token via create', async () => {
        influxService.aggregateMeteringCoToken.mockResolvedValue([{ _value: 4 }]);
        jest.spyOn(InfluxService, 'getMeteringCoCustomers').mockResolvedValue([
            {
                customerId: 'cust-1',
                businessID: 'meteringco-production',
                metadata: JSON.stringify({ businessID: 'tenant-production' }),
            },
        ] as any);
        const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ message: 'ok' });

        await service.billPeriod({
            customerId: 'cust-1',
            startDate: new Date('2024-01-01T00:00:00.000Z'),
            endDate: new Date('2024-01-01T06:00:00.000Z'),
        });

        expect(createSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                businessID: 'tenant-production',
                tokenAmount: '4',
                metadata: expect.objectContaining({ tokenType: TokenType.apiCall }),
            }),
        );
    });

    it('does not reopen a billed period', async () => {
        influxService.aggregateMeteringCoToken.mockResolvedValue([{ _value: 2 }]);
        jest.spyOn(InfluxService, 'getMeteringCoCustomers').mockResolvedValue([
            {
                customerId: 'cust-1',
                businessID: 'meteringco-production',
                metadata: JSON.stringify({ businessID: 'tenant-production' }),
            },
        ] as any);
        const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ message: 'ok' });
        const window = {
            customerId: 'cust-1',
            startDate: new Date('2024-02-01T00:00:00.000Z'),
            endDate: new Date('2024-02-01T06:00:00.000Z'),
        };
        await service.billPeriod(window);
        await service.billPeriod(window);
        expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('closes a provided window for a single platform customer', async () => {
        const billSpy = jest.spyOn(service, 'billPeriod').mockResolvedValue();
        await service.closePeriod({
            customerId: 'cust-1',
            startDate: '2024-03-01T00:00:00.000Z',
            endDate: '2024-03-01T06:00:00.000Z',
        });
        expect(billSpy).toHaveBeenCalledWith({
            customerId: 'cust-1',
            startDate: new Date('2024-03-01T00:00:00.000Z'),
            endDate: new Date('2024-03-01T06:00:00.000Z'),
        });
    });

    it('records a late arrival at its own moment after the period was billed', async () => {
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: { customerId: 'cust-1', businessID: 'meteringco-production' } as any,
        });
        influxService.aggregateMeteringCoToken.mockResolvedValue([{ _value: 1 }]);
        jest.spyOn(InfluxService, 'getMeteringCoCustomers').mockResolvedValue([
            {
                customerId: 'cust-1',
                businessID: 'meteringco-production',
                metadata: JSON.stringify({ businessID: 'tenant-production' }),
            },
        ] as any);
        const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ message: 'ok' });
        const window = {
            customerId: 'cust-1',
            startDate: new Date('2024-04-01T00:00:00.000Z'),
            endDate: new Date('2024-04-01T06:00:00.000Z'),
        };
        await service.billPeriod(window);
        expect(createSpy).toHaveBeenCalledTimes(1);

        await service.registerCall({
            businessID: 'tenant-production',
            amount: '1',
            moment: '2024-04-01T03:00:00.000Z',
        });
        expect(influxService.loadPoints).toHaveBeenCalled();
        const entityPoint = influxService.getPoint.mock.results[0]?.value || influxService.getPoint();
        await service.billPeriod(window);
        expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('records a call at its own moment via the entity transformer', () => {
        const token = new MeteringCoToken({
            businessID: 'tenant-production',
            tokenAmount: '1',
            timestamp: '2023-12-31T23:00:00.000Z',
            metadata: { tokenType: TokenType.apiCall },
        });
        const entity = new TokenConsumer(token, 'cust-1', 'meteringco-production');
        const point: any = {
            tag: jest.fn(),
            floatField: jest.fn(),
            timestamp: jest.fn(),
        };
        const influx = { getPoint: jest.fn(() => point) } as any;
        TokenConsumer.transformer(entity, influx);
        expect(point.timestamp).toHaveBeenCalledWith(new Date('2023-12-31T23:00:00.000Z'));
        expect(point.tag).toHaveBeenCalledWith('customerId', 'cust-1');
        expect(point.tag).toHaveBeenCalledWith('businessID', 'meteringco-production');
    });
});
