import { TokenConsumerAsyncProcessor } from './token-consumer-async-processor';
import { TokenType } from './dto/TokenType';

describe('TokenConsumerAsyncProcessor', () => {
    it('exposes the aggregate bucket and processor names', () => {
        expect(TokenConsumerAsyncProcessor.tokenAggregateBucket).toBe('dogfood-aggregate-bucket');
        expect(TokenConsumerAsyncProcessor.aggregationProcessor).toBe('aggregation-processor');
        expect(TokenConsumerAsyncProcessor.aggregationSchedulerIdGenerator('acme')).toBe(
            'aggregation-processor-acme',
        );
    });

    it('closes the supplied window, or none, via closePeriod', async () => {
        const closePeriod = jest.fn().mockResolvedValue({ message: 'ok' });
        const processor = new TokenConsumerAsyncProcessor(
            { closePeriod } as any,
            {} as any,
            {} as any,
            {} as any,
        );
        await processor.aggregateTokens({
            data: {
                subject: 'sub-1',
                rate: '0 */6 * * *',
                businessID: 'acme-production',
                scheduleParameters: {
                    startDate: '2024-06-01T00:00:00.000Z',
                    endDate: '2024-06-01T06:00:00.000Z',
                },
            },
        } as any);
        expect(closePeriod).toHaveBeenCalledWith({
            businessID: 'acme-production',
            subject: 'sub-1',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-01T06:00:00.000Z',
        });

        await processor.aggregateTokens({
            data: {
                subject: 'sub-1',
                rate: '0 */6 * * *',
                businessID: 'acme-production',
                scheduleParameters: {},
            },
        } as any);
        expect(closePeriod).toHaveBeenCalledWith({
            businessID: 'acme-production',
            subject: 'sub-1',
            startDate: undefined,
            endDate: undefined,
        });
    });
});
