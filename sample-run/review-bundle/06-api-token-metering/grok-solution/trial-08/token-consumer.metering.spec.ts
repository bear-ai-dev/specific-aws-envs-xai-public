import { TokenConsumer } from './entities/token-consumer.entity';
import { MeteringCoToken } from './dto/meteringcoToken.dto';
import { TokenType } from './dto/TokenType';
import { TokenConsumerService } from './token-consumer.service';
import { OnboardingEntity } from '../users/entities/onboarding.entity';
import { TokenConsumerAsyncProcessor } from './token-consumer-async-processor';

describe('platform API traffic metering', () => {
    it('records a call at its own moment with identifying metadata', () => {
        const timestamp = '2024-01-15T03:14:15.000Z';
        const token = new MeteringCoToken({
            businessID: 'tenant-prod',
            tokenAmount: '1',
            timestamp,
            metadata: { tokenType: TokenType.apiCall, path: '/customers' },
        });
        const entity = new TokenConsumer(token, 'cust-1', 'meteringco-production');
        expect(entity.customerId).toBe('cust-1');
        expect(entity.saasCustomerAssociatedBusinessID).toBe('meteringco-production');
        expect(entity.saasCustomerBusinessID).toBe('tenant-prod');
        expect(entity.timestamp).toBe(timestamp);
        expect(entity.metadata.tokenType).toBe(TokenType.apiCall);

        const tags: Record<string, string> = {};
        let fieldName: string;
        let fieldValue: number;
        let writtenTimestamp: Date;
        const influxService = {
            getPoint: () => ({
                tag: (k: string, v: string) => {
                    tags[k] = v;
                },
                floatField: (k: string, v: number) => {
                    fieldName = k;
                    fieldValue = v;
                },
                timestamp: (d: Date) => {
                    writtenTimestamp = d;
                },
            }),
        };
        const points = TokenConsumer.transformer(entity, influxService as any);
        expect(points).toHaveLength(1);
        expect(tags.customerId).toBe('cust-1');
        expect(tags.businessID).toBe('meteringco-production');
        expect(tags.saasCustomerBusinessID).toBe('tenant-prod');
        expect(tags.metadata_tokenType).toBe(TokenType.apiCall);
        expect(tags.metadata_path).toBe('/customers');
        expect(fieldName).toBe('tokenAmount');
        expect(fieldValue).toBe(1);
        expect(writtenTimestamp.toISOString()).toBe(timestamp);
    });

    it('does not re-date a late arrival into a later period', () => {
        const lateMoment = '2024-01-15T01:00:00.000Z';
        const token = new MeteringCoToken({
            businessID: 'tenant-prod',
            tokenAmount: '1',
            timestamp: lateMoment,
            metadata: { tokenType: TokenType.apiCall },
        });
        const entity = new TokenConsumer(token, 'cust-1', 'meteringco-production');
        let writtenTimestamp: Date;
        const influxService = {
            getPoint: () => ({
                tag: () => undefined,
                floatField: () => undefined,
                timestamp: (d: Date) => {
                    writtenTimestamp = d;
                },
            }),
        };
        TokenConsumer.transformer(entity, influxService as any);
        expect(writtenTimestamp.toISOString()).toBe(lateMoment);
        expect(writtenTimestamp.getTime()).toBe(new Date(lateMoment).getTime());
    });

    it('bills production customers against the production account and sandbox otherwise', () => {
        expect(
            TokenConsumerService.resolvePlatformDimensionId({
                saasCustomerAssociatedBusinessID: OnboardingEntity.dogfoodBusinessID,
            }),
        ).toBe(OnboardingEntity.dogfoodProductionApiCallDimensionId);
        expect(
            TokenConsumerService.resolvePlatformDimensionId({
                saasCustomerAssociatedBusinessID: OnboardingEntity.dogfoodSandboxBusinessID,
            }),
        ).toBe(OnboardingEntity.dogfoodSandboxApiCallDimensionId);
        expect(
            TokenConsumerService.resolvePlatformDimensionId({
                saasCustomerAssociatedBusinessID: OnboardingEntity.dogfoodBusinessID,
                meteringcoCustomer: {
                    offering: {
                        dimensions: [{ dimensionId: 'from-offering', metadata: { tokenType: TokenType.apiCall } }],
                    },
                } as any,
                tokenType: TokenType.apiCall,
            }),
        ).toBe('from-offering');
    });

    it('writes registered traffic to the named aggregate bucket without flushing', async () => {
        const loadPoints = jest.fn().mockResolvedValue(undefined);
        const influxService = {
            org: 'meteringco',
            loadPoints,
            getPoint: () => ({
                tag: jest.fn(),
                floatField: jest.fn(),
                timestamp: jest.fn(),
            }),
        };
        jest.spyOn(TokenConsumerService, 'getMeteringCoCustomerId').mockResolvedValue({
            meteringcoCustomerId: 'cust-1',
            saasCustomerAssociatedBusinessID: 'meteringco-production',
            meteringcoCustomer: {} as any,
        });

        await TokenConsumerService.registerCall({
            businessID: 'tenant-prod',
            tokenAmount: '1',
            timestamp: '2024-01-15T03:00:00.000Z',
            metadata: { tokenType: TokenType.apiCall },
            influxService: influxService as any,
        });

        expect(loadPoints).toHaveBeenCalledTimes(1);
        const [bucket, org, points, flush] = loadPoints.mock.calls[0];
        expect(bucket).toBe(TokenConsumerAsyncProcessor.tokenAggregateBucket);
        expect(org).toBe('meteringco');
        expect(points).toHaveLength(1);
        expect(flush).toBe(false);
    });

    it('names the aggregation processor used to close a six-hour window', () => {
        expect(TokenConsumerAsyncProcessor.aggregationProcessor).toBe('aggregation-processor');
        expect(TokenConsumerAsyncProcessor.tokenAggregateBucket).toBe('dogfood-aggregate-bucket');
        expect(TokenConsumerAsyncProcessor.aggregatorSchedulerIdGenerator('biz')).toBe(
            'aggregation-processor-biz',
        );
    });
});
