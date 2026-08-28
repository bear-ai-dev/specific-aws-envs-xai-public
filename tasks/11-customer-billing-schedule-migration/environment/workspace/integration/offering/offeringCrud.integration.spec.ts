import { Customer } from '../client/publicClient/customer';
import { AggregationMethod } from '../client/publicClient/dimension';
import { Offering } from '../client/publicClient/offering';
import { setupCustomerWallStrTrading, setupDimensionRequest, setupSimpleOffering } from '../setupAndTeardown/setup';
import { sleep } from '../utils/utils';

describe('Offering CRUD', () => {
    test('Get all Offering', async () => {
        const offeringClient = new Offering();
        const response = await offeringClient.getAll();
        expect(response).toEqual(expect.any(Array));
    });
    test('Offerings should not delete if a customer is using one', async () => {
        const dimension = await setupDimensionRequest(null, AggregationMethod.Sum);
        const offering = await setupSimpleOffering([dimension.dimensionId]);
        const customer = await setupCustomerWallStrTrading({
            offeringId: offering.offeringId,
        });
        await sleep(1500);
        const fullCustomerInformation = (await customer.get()) as Customer;
        expect(customer.customerId).toStrictEqual(expect.any(String));
        expect(fullCustomerInformation?.offering?.offeringId).toEqual(offering.offeringId);

        await expect(offering.delete()).rejects.toThrowError();
    });
});
