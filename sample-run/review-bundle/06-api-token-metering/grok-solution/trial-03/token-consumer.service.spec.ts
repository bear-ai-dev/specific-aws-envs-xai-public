import { Test, TestingModule } from '@nestjs/testing';
import { TokenConsumerService } from './token-consumer.service';
import { forwardRef } from '@nestjs/common';
import { PrivateAPICustomerModule } from '../customer/customer.module';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module';
import { PrivateAPIOfferingModule } from '../offering/offering.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { AuthzModule } from '../authz/authz.module';
import { InfluxModule } from '../influx/influx.module';
import { UsersModule } from '../users/users.module';
import { TokenConsumerAsyncProcessor } from './token-consumer-async-processor';
import { TokenType } from './dto/TokenType';
import { TokenConsumer } from './entities/token-consumer.entity';
import { OnboardingEntity } from '../users/entities/onboarding.entity';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';
import { cache as cacheManager } from '../cacheStore.js';

describe('TokenConsumerService', () => {
    let service: TokenConsumerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [TokenConsumerService],
            imports: [
                forwardRef(() => PrivateAPICustomerModule),
                forwardRef(() => PrivateAPIDimensionsModule),
                forwardRef(() => PrivateAPIOfferingModule),
                forwardRef(() => SchedulerModule),
                forwardRef(() => AuthzModule),
                forwardRef(() => InfluxModule),
                forwardRef(() => UsersModule),
            ],
        }).compile();

        service = module.get<TokenConsumerService>(TokenConsumerService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});

describe('TokenConsumerService API traffic path', () => {
    const tenantBusinessID = 'acme-production';
    const platformCustomerId = 'platform-cust-1';
    const platformBusinessID = OnboardingEntity.dogfoodBusinessID;
    let loadPoints: jest.Mock;
    let aggregateMeteringCoToken: jest.Mock;
    let publishSpy: jest.SpyInstance;
    let service: TokenConsumerService;

    beforeEach(async () => {
        loadPoints = jest.fn().mockResolvedValue(undefined);
        aggregateMeteringCoToken = jest.fn().mockResolvedValue([]);
        publishSpy = jest.spyOn(StandardMeasurementEntity, 'publish').mockReturnValue({
            message: 'published',
            id: 'x',
            data: [],
        } as any);

        await cacheManager.set(
            TokenConsumerService.cacheKey(tenantBusinessID),
            JSON.stringify({
                customerId: platformCustomerId,
                saasCustomerAssociatedBusinessID: platformBusinessID,
                customerRes: {
                    customerId: platformCustomerId,
                    businessID: platformBusinessID,
                    offering: {
                        offeringId: OnboardingEntity.dogfoodMeteringCoOfferingId,
                        dimensions: [
                            {
                                dimensionId: OnboardingEntity.dogfoodApiCallDimensionId,
                                dimensionName: 'apiCall',
                                metadata: { tokenType: TokenType.apiCall },
                            },
                        ],
                    },
                },
            }),
        );

        service = new TokenConsumerService(
            {} as any,
            {} as any,
            {} as any,
            {
                loadPoints,
                getPoint: () => {
                    const p: any = {
                        tag: jest.fn().mockReturnThis(),
                        floatField: jest.fn().mockReturnThis(),
                        timestamp: jest.fn().mockReturnThis(),
                    };
                    return p;
                },
                aggregateMeteringCoToken,
            } as any,
        );
    });

    afterEach(async () => {
        publishSpy.mockRestore();
        await cacheManager.del(TokenConsumerService.cacheKey(tenantBusinessID));
        jest.clearAllMocks();
    });

    it('records a call in the aggregate bucket without flushing', async () => {
        const moment = '2024-06-01T01:00:00.000Z';
        await service.registerApiCall({
            businessID: tenantBusinessID,
            amount: '1',
            timestamp: moment,
            metadata: { path: '/usage', method: 'POST' },
        });
        expect(loadPoints).toHaveBeenCalledTimes(1);
        const [bucket, , points, flush] = loadPoints.mock.calls[0];
        expect(bucket).toBe(TokenConsumerAsyncProcessor.tokenAggregateBucket);
        expect(flush).toBe(false);
        expect(Array.isArray(points)).toBe(true);
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it('records a late call at its own moment and does not bill it', async () => {
        const lateMoment = '2024-06-01T00:30:00.000Z';
        await service.registerApiCall({
            businessID: tenantBusinessID,
            amount: '1',
            timestamp: lateMoment,
            metadata: { id: 'late-1' },
        });
        expect(loadPoints).toHaveBeenCalled();
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it('closes a window by aggregating then billing a single token via create', async () => {
        aggregateMeteringCoToken.mockResolvedValueOnce([{ _value: 7 }]);
        const start = '2024-06-01T00:00:00.000Z';
        const end = '2024-06-01T06:00:00.000Z';
        await service.closePeriod({
            businessID: tenantBusinessID,
            startDate: start,
            endDate: end,
        });
        expect(aggregateMeteringCoToken).toHaveBeenCalledWith({
            customerId: platformCustomerId,
            startDate: new Date(start),
            endDate: new Date(end),
        });
        expect(publishSpy).toHaveBeenCalledTimes(1);
        const published = publishSpy.mock.calls[0][0];
        expect(published.customerId).toBe(platformCustomerId);
        expect(published.businessID).toBe(platformBusinessID);
        expect(published.dimensionId).toBe(OnboardingEntity.dogfoodApiCallDimensionId);
        expect(published.recordValue).toBe(7);
        expect(published.timestamp).toBe(end);
    });

    it('defaults the close window to the six hours behind now', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
        aggregateMeteringCoToken.mockResolvedValueOnce([]);
        await service.closePeriod({ businessID: tenantBusinessID });
        const arg = aggregateMeteringCoToken.mock.calls[0][0];
        expect(arg.endDate.toISOString()).toBe('2024-06-01T12:00:00.000Z');
        expect(arg.startDate.toISOString()).toBe('2024-06-01T06:00:00.000Z');
        jest.useRealTimers();
    });

    it('does not bill a zero-total window', async () => {
        aggregateMeteringCoToken.mockResolvedValueOnce([{ _value: 0 }]);
        await service.closePeriod({
            businessID: tenantBusinessID,
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-01T06:00:00.000Z',
        });
        expect(publishSpy).not.toHaveBeenCalled();
    });

    it('bills sandbox platform customers against the sandbox dimension', async () => {
        const sandboxTenant = 'acme-sandbox';
        await cacheManager.set(
            TokenConsumerService.cacheKey(sandboxTenant),
            JSON.stringify({
                customerId: 'sandbox-cust',
                saasCustomerAssociatedBusinessID: OnboardingEntity.dogfoodSandboxBusinessID,
                customerRes: { customerId: 'sandbox-cust', businessID: OnboardingEntity.dogfoodSandboxBusinessID },
            }),
        );
        aggregateMeteringCoToken.mockResolvedValueOnce([{ _value: 3 }]);
        await service.closePeriod({
            businessID: sandboxTenant,
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-01T06:00:00.000Z',
        });
        const published = publishSpy.mock.calls[0][0];
        expect(published.businessID).toBe(OnboardingEntity.dogfoodSandboxBusinessID);
        expect(published.dimensionId).toBe(OnboardingEntity.dogfoodSandboxApiCallDimensionId);
        await cacheManager.del(TokenConsumerService.cacheKey(sandboxTenant));
    });

    it('resolves production vs sandbox dimension ids', () => {
        expect(TokenConsumerService.resolveApiCallDimensionId(OnboardingEntity.dogfoodBusinessID)).toBe(
            OnboardingEntity.dogfoodApiCallDimensionId,
        );
        expect(TokenConsumerService.resolveApiCallDimensionId(OnboardingEntity.dogfoodSandboxBusinessID)).toBe(
            OnboardingEntity.dogfoodSandboxApiCallDimensionId,
        );
    });
});

describe('TokenConsumer transformer', () => {
    it('writes amount, customer, platform account and moment onto a point', () => {
        const tag = jest.fn().mockReturnThis();
        const floatField = jest.fn().mockReturnThis();
        const timestamp = jest.fn().mockReturnThis();
        const influx = { getPoint: () => ({ tag, floatField, timestamp }) } as any;
        const entity = new TokenConsumer(
            {
                businessID: 'acme-production',
                tokenAmount: '2',
                timestamp: '2024-06-01T01:00:00.000Z',
                metadata: { tokenType: TokenType.apiCall, path: '/customers' },
            } as any,
            'cust-1',
            OnboardingEntity.dogfoodBusinessID,
        );
        TokenConsumer.transformer(entity, influx);
        expect(tag).toHaveBeenCalledWith('customerId', 'cust-1');
        expect(tag).toHaveBeenCalledWith('businessID', OnboardingEntity.dogfoodBusinessID);
        expect(tag).toHaveBeenCalledWith('tokenType', TokenType.apiCall);
        expect(floatField).toHaveBeenCalledWith('tokenAmount', 2);
        expect(timestamp).toHaveBeenCalledWith(new Date('2024-06-01T01:00:00.000Z'));
    });
});
