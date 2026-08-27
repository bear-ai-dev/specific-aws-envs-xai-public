import {
    setupCustomerWallStrTrading,
    setupDimensionRequest,
    setupSimpleOffering,
    setupSimpleService,
} from '../setupAndTeardown/setup';
import { Usage } from '../client/publicClient/usage';
import { AggregationInterval, AggregationMethod, Dimension } from '../client/publicClient/dimension';
import { input } from './dimensionAggregation.integration.input';
import { sleep } from '../utils/utils';

describe('Dimension aggregation', () => {
    test.concurrent.each(input)(
        'Validate $aggregationMethod aggregation with input $usageInput',
        async ({ aggregationMethod, usageInput, aggregatedValue }) => {
            const customer = await setupCustomerWallStrTrading();
            const dimension = await setupDimensionRequest(null, aggregationMethod);
            const usage = new Usage();
            const offering = await setupSimpleOffering([dimension.dimensionId]);
            const service = await setupSimpleService(offering.offeringId, customer.customerId);

            for (const value of usageInput) {
                await usage.create({
                    applicationId: service.applicationId,
                    serviceId: service.serviceId,
                    dimensionId: dimension.dimensionId,
                    recordValue: value,
                });
            }
            await sleep(1000 * 10);
            const serviceUsage = await service.getUsage(
                new Date(new Date().getTime() - 1000 * 60 * 60).toISOString(),
                new Date().toISOString(),
                AggregationInterval.Hour
            );
            const testValue = serviceUsage[0].usage[serviceUsage[0].usage.length - 1].value;
            expect(testValue).toBe(aggregatedValue);
        }
    );
});
