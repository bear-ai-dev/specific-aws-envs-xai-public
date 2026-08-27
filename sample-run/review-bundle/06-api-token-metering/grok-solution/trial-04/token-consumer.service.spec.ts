import { Test, TestingModule } from '@nestjs/testing';
import { TokenConsumerService } from './token-consumer.service';
import { OnboardingEntity } from '../users/entities/onboarding.entity';

describe('TokenConsumerService', () => {
    it('should be defined as a class', () => {
        expect(TokenConsumerService).toBeDefined();
    });

    describe('resolveCloseWindow', () => {
        it('uses an explicit window when both bounds are given', () => {
            const start = '2024-01-01T00:00:00.000Z';
            const end = '2024-01-01T06:00:00.000Z';
            const window = TokenConsumerService.resolveCloseWindow(start, end);
            expect(window.startDate.toISOString()).toBe(start);
            expect(window.endDate.toISOString()).toBe(end);
        });

        it('closes the six hours behind now when no window is given', () => {
            const now = new Date('2024-01-01T12:00:00.000Z');
            jest.useFakeTimers().setSystemTime(now);
            const window = TokenConsumerService.resolveCloseWindow();
            expect(window.endDate.toISOString()).toBe(now.toISOString());
            expect(window.startDate.toISOString()).toBe('2024-01-01T06:00:00.000Z');
            jest.useRealTimers();
        });
    });

    describe('sumAggregatedTokenAmount', () => {
        it('returns 0 for empty input', () => {
            expect(TokenConsumerService.sumAggregatedTokenAmount([])).toBe(0);
            expect(TokenConsumerService.sumAggregatedTokenAmount(undefined as any)).toBe(0);
        });

        it('sums numeric and string values', () => {
            expect(
                TokenConsumerService.sumAggregatedTokenAmount([{ _value: 2 }, { _value: '3.5' }, { _value: 'nope' }]),
            ).toBe(5.5);
        });
    });

    describe('isProductionAccount', () => {
        it('treats meteringco-production as production', () => {
            expect(TokenConsumerService.isProductionAccount('meteringco-production')).toBe(true);
        });

        it('treats meteringco-sandbox and *-sandbox as sandbox', () => {
            expect(TokenConsumerService.isProductionAccount('meteringco-sandbox')).toBe(false);
            expect(TokenConsumerService.isProductionAccount('acme-sandbox')).toBe(false);
        });
    });

    describe('resolvePlatformAccount', () => {
        it('bills production customers against the production account and dimension', () => {
            const { account, dimensionId } = TokenConsumerService.resolvePlatformAccount(
                'meteringco-production',
                undefined,
                'apiCall',
            );
            expect(account).toBe(TokenConsumerService.productionAccount);
            expect(dimensionId).toBe(OnboardingEntity.dogfoodApiCallDimensionId);
        });

        it('bills sandbox customers against the sandbox pair', () => {
            const { account, dimensionId } = TokenConsumerService.resolvePlatformAccount(
                'meteringco-sandbox',
                undefined,
                'apiCall',
            );
            expect(account).toBe(TokenConsumerService.sandboxAccount);
            expect(dimensionId).toBe(OnboardingEntity.dogfoodSandboxApiCallDimensionId);
        });

        it('prefers a matching offering dimension when present', () => {
            const { dimensionId } = TokenConsumerService.resolvePlatformAccount(
                'meteringco-production',
                {
                    offering: {
                        dimensions: [
                            { dimensionId: 'dim-api', dimensionName: 'API Calls', metadata: { tokenType: 'apiCall' } },
                        ],
                    },
                } as any,
                'apiCall',
            );
            expect(dimensionId).toBe('dim-api');
        });
    });
});

describe('TokenConsumerService instance', () => {
    let service: TokenConsumerService;
    const influxService = {
        loadPoints: jest.fn().mockResolvedValue(undefined),
        getPoint: jest.fn().mockReturnValue({
            timestamp: jest.fn().mockReturnThis(),
            tag: jest.fn().mockReturnThis(),
            floatField: jest.fn().mockReturnThis(),
            intField: jest.fn().mockReturnThis(),
        }),
        aggregateMeteringCoToken: jest.fn().mockResolvedValue([{ _value: 4 }]),
        queryAPIInstance: jest.fn().mockReturnValue({ collectRows: jest.fn().mockResolvedValue([]) }),
    };
    const usageService = { create: jest.fn().mockResolvedValue({ message: 'ok' }) };

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: { offering: { dimensions: [] } } as any,
        });
        service = new TokenConsumerService(
            undefined as any,
            undefined as any,
            undefined as any,
            influxService as any,
            usageService as any,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('registers a call into the aggregate bucket without flushing', async () => {
        await service.registerCall({
            businessID: 'tenant-1',
            tokenAmount: '1',
            timestamp: '2024-01-01T01:00:00.000Z',
            metadata: { tokenType: 'apiCall' },
        });
        expect(influxService.loadPoints).toHaveBeenCalledWith(
            'dogfood-aggregate-bucket',
            process.env.INFLUX_ORG,
            expect.any(Array),
            false,
        );
        expect(usageService.create).not.toHaveBeenCalled();
    });

    it('records a late call at its own moment', async () => {
        await service.registerCall({
            businessID: 'tenant-1',
            tokenAmount: '1',
            timestamp: '2023-12-31T20:00:00.000Z',
            metadata: { tokenType: 'apiCall' },
        });
        const [points] = influxService.loadPoints.mock.calls[0].slice(2);
        expect(points).toBeDefined();
        expect(influxService.getPoint).toHaveBeenCalledWith('tokenConsumer');
    });

    it('closes a period, bills the total once, and does not reopen a closed period', async () => {
        await service.closePeriod({
            businessID: 'tenant-1',
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-01T06:00:00.000Z',
        });
        expect(influxService.aggregateMeteringCoToken).toHaveBeenCalled();
        expect(usageService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                businessID: 'meteringco-production',
                customerId: 'cust-1',
                recordValue: '4',
            }),
        );

        influxService.queryAPIInstance.mockReturnValue({ collectRows: jest.fn().mockResolvedValue([{}]) });
        usageService.create.mockClear();
        influxService.aggregateMeteringCoToken.mockClear();
        await service.closePeriod({
            businessID: 'tenant-1',
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-01T06:00:00.000Z',
        });
        expect(influxService.aggregateMeteringCoToken).not.toHaveBeenCalled();
        expect(usageService.create).not.toHaveBeenCalled();
    });
});
