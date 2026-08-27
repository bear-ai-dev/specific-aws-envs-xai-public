import { TokenConsumerService, METERINGCO_PRODUCTION_BUSINESS_ID } from './token-consumer.service';
import { TokenConsumer } from './entities/token-consumer.entity';
import { TokenConsumerAsyncProcessor } from './token-consumer-async-processor';
import { TokenType } from './dto/TokenType';
import { MeteringCoToken } from './dto/meteringcoToken.dto';

describe('platform API traffic metering', () => {
    const customerId = 'platform-customer-1';
    const tenantBusinessID = 'tenant-prod';
    const platformBusinessID = METERINGCO_PRODUCTION_BUSINESS_ID;

    const makePoint = () => {
        const point: any = {
            tags: {} as Record<string, string>,
            fields: {} as Record<string, number>,
            ts: undefined as Date | undefined,
        };
        point.tag = jest.fn((k: string, v: string) => {
            point.tags[k] = v;
            return point;
        });
        point.floatField = jest.fn((k: string, v: number) => {
            point.fields[k] = v;
            return point;
        });
        point.timestamp = jest.fn((d: Date) => {
            point.ts = d;
            return point;
        });
        return point;
    };

    const makeInflux = (overrides: Record<string, any> = {}) => {
        const point = makePoint();
        return {
            getPoint: jest.fn(() => point),
            loadPoints: jest.fn(async () => undefined),
            aggregateMeteringCoToken: jest.fn(async () => [{ _value: 4 }]),
            lastPoint: point,
            ...overrides,
        };
    };

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: customerId,
            saasCustomerAssociatedBusinessID: platformBusinessID,
            meteringcoCustomer: {
                customerId,
                businessID: platformBusinessID,
                offering: {
                    dimensions: [{ dimensionId: 'api-call-dim', dimensionName: 'apiCall', metadata: { tokenType: TokenType.apiCall } }],
                },
            } as any,
        });
    });

    it('records a call against the platform customer in the aggregate bucket without flushing', async () => {
        const influx = makeInflux();
        const moment = '2024-01-01T01:00:00.000Z';
        await TokenConsumerService.registerCall({
            businessID: tenantBusinessID,
            subject: 'user-1',
            amount: '1',
            timestamp: moment,
            metadata: { tokenType: TokenType.apiCall, path: '/customers' },
            influxService: influx as any,
        });

        expect(influx.loadPoints).toHaveBeenCalledTimes(1);
        const [bucket, , points, flush] = influx.loadPoints.mock.calls[0];
        expect(bucket).toBe(TokenConsumerAsyncProcessor.tokenAggregateBucket);
        expect(flush).toBe(false);
        expect(points).toHaveLength(1);
        expect(influx.lastPoint.tags.customerId).toBe(customerId);
        expect(influx.lastPoint.tags.businessID).toBe(platformBusinessID);
        expect(influx.lastPoint.fields.tokenAmount).toBe(1);
    });

    it('records a late call at its own moment, not now', async () => {
        const influx = makeInflux();
        const lateMoment = '2024-01-01T00:00:00.000Z';
        await TokenConsumerService.registerCall({
            businessID: tenantBusinessID,
            amount: '1',
            timestamp: lateMoment,
            influxService: influx as any,
        });
        expect(influx.lastPoint.ts.toISOString()).toBe(lateMoment);
    });

    it('TokenConsumer.transformer keeps the call moment and customer tags', () => {
        const influx = makeInflux();
        const token = new MeteringCoToken({
            businessID: tenantBusinessID,
            tokenAmount: '3',
            timestamp: '2024-06-01T12:00:00.000Z',
            metadata: { tokenType: TokenType.apiCall },
        });
        const entity = new TokenConsumer(token, customerId, platformBusinessID);
        TokenConsumer.transformer(entity, influx as any);
        expect(influx.lastPoint.tags.customerId).toBe(customerId);
        expect(influx.lastPoint.tags.businessID).toBe(platformBusinessID);
        expect(influx.lastPoint.fields.tokenAmount).toBe(3);
        expect(influx.lastPoint.ts.toISOString()).toBe('2024-06-01T12:00:00.000Z');
    });

    it('closePeriod totals a window and bills one token via create', async () => {
        const influx = makeInflux();
        const service = Object.create(TokenConsumerService.prototype) as TokenConsumerService;
        (service as any).influxService = influx;
        (service as any).environmentSerivce = {};
        const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ message: 'ok' });

        const start = '2024-01-01T00:00:00.000Z';
        const end = '2024-01-01T06:00:00.000Z';
        const result = await service.closePeriod({
            businessID: tenantBusinessID,
            startDate: start,
            endDate: end,
        });

        expect(influx.aggregateMeteringCoToken).toHaveBeenCalledWith({
            customerId,
            startDate: new Date(start),
            endDate: new Date(end),
        });
        expect(createSpy).toHaveBeenCalledTimes(1);
        const billed = createSpy.mock.calls[0][0];
        expect(billed.tokenAmount).toBe('4');
        expect(billed.metadata.tokenType).toBe(TokenType.apiCall);
        expect(billed.metadata.periodStart).toBe(start);
        expect(billed.metadata.periodEnd).toBe(end);
        expect(result?.message).toContain('total: 4');
    });

    it('closePeriod without a window uses the six hours behind now', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
        const influx = makeInflux();
        const service = Object.create(TokenConsumerService.prototype) as TokenConsumerService;
        (service as any).influxService = influx;
        (service as any).environmentSerivce = {};
        jest.spyOn(service, 'create').mockResolvedValue({ message: 'ok' });

        await service.closePeriod({ businessID: tenantBusinessID });

        const arg = influx.aggregateMeteringCoToken.mock.calls[0][0];
        expect(arg.endDate.toISOString()).toBe('2024-01-01T12:00:00.000Z');
        expect(arg.startDate.toISOString()).toBe('2024-01-01T06:00:00.000Z');
        jest.useRealTimers();
    });

    it('create bills usage against the production account/dimension for a production customer', async () => {
        const influx = makeInflux();
        const service = Object.create(TokenConsumerService.prototype) as TokenConsumerService;
        (service as any).influxService = influx;
        (service as any).environmentSerivce = {};

        await service.create({
            businessID: tenantBusinessID,
            tokenAmount: '7',
            timestamp: '2024-01-01T06:00:00.000Z',
            metadata: { tokenType: TokenType.apiCall },
        });

        expect(influx.loadPoints).toHaveBeenCalledTimes(1);
        const [bucket, , points, flush] = influx.loadPoints.mock.calls[0];
        expect(bucket).toBe(`${process.env.STAGE}-usage-data`);
        expect(flush).toBe(true);
        expect(points).toHaveLength(1);
        expect(influx.lastPoint.tags.businessID).toBe(platformBusinessID);
        expect(influx.lastPoint.tags.customerId).toBe(customerId);
        expect(influx.lastPoint.tags.dimensionId).toBe('api-call-dim');
    });

    it('create bills usage against the sandbox pair when the platform customer is sandbox', async () => {
        (TokenConsumerService.getMeteringCoCustomerId as jest.Mock).mockResolvedValue({
            meteringcoCustomerId: customerId,
            saasCustomerAssociatedBusinessID: 'meteringco-sandbox',
            meteringcoCustomer: {
                customerId,
                businessID: 'meteringco-sandbox',
                offering: {
                    dimensions: [{ dimensionId: 'sandbox-api-dim', dimensionName: 'apiCall', metadata: { tokenType: TokenType.apiCall } }],
                },
            },
        });
        const influx = makeInflux();
        const service = Object.create(TokenConsumerService.prototype) as TokenConsumerService;
        (service as any).influxService = influx;
        (service as any).environmentSerivce = {};

        await service.create({
            businessID: 'tenant-sandbox',
            tokenAmount: '2',
            timestamp: '2024-01-01T06:00:00.000Z',
            metadata: { tokenType: TokenType.apiCall },
        });

        expect(influx.lastPoint.tags.businessID).toBe('meteringco-sandbox');
        expect(influx.lastPoint.tags.dimensionId).toBe('sandbox-api-dim');
    });

    it('duplicate arrivals both record at the original moment (at-least-once, not re-dated)', async () => {
        const influx = makeInflux();
        const moment = '2024-01-01T03:00:00.000Z';
        await TokenConsumerService.registerCall({
            businessID: tenantBusinessID,
            amount: '1',
            timestamp: moment,
            influxService: influx as any,
        });
        await TokenConsumerService.registerCall({
            businessID: tenantBusinessID,
            amount: '1',
            timestamp: moment,
            influxService: influx as any,
        });
        expect(influx.loadPoints).toHaveBeenCalledTimes(2);
        expect(influx.lastPoint.ts.toISOString()).toBe(moment);
    });

    it('does not drop a call when getMeteringCoCustomerId resolves after a period would have closed', async () => {
        const influx = makeInflux();
        const pastMoment = '2023-12-31T20:00:00.000Z';
        await TokenConsumerService.registerCall({
            businessID: tenantBusinessID,
            amount: '1',
            timestamp: pastMoment,
            influxService: influx as any,
        });
        expect(influx.loadPoints).toHaveBeenCalled();
        expect(influx.lastPoint.ts.toISOString()).toBe(pastMoment);
        expect(influx.loadPoints.mock.calls[0][3]).toBe(false);
    });
});
