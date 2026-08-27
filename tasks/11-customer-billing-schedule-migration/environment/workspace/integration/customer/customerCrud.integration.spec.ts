import { Customer, TaxExempt } from '../client/publicClient/customer';
import { AggregationMethod } from '../client/publicClient/dimension';
import { Address } from '../client/publicClient/init';
import { setupCustomerWallStrTrading, setupDimensionRequest, setupSimpleOffering } from '../setupAndTeardown/setup';
import { sleep } from '../utils/utils';
import { ADDRESS_INPUT } from './customerCrud.integration.input';

describe('Customer CRUD', () => {
    test('Get all customers should be defined', async () => {
        const customerClient = new Customer();
        const response = await customerClient.getAll();
        expect(response).toEqual(expect.any(Array));
    });
});

describe('Test customer create', () => {
    test('Create customer with no name ', async () => {
        try {
            await setupCustomerWallStrTrading({ customerName: null });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create customer with no email ', async () => {
        try {
            await setupCustomerWallStrTrading({ email: null });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create customer with no payment channel ', async () => {
        try {
            await setupCustomerWallStrTrading({ paymentChannel: null });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create customer with no payment channel options ', async () => {
        try {
            await setupCustomerWallStrTrading({ paymentChannelOptions: null });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create customer with only required fields', async () => {
        const customer = await setupCustomerWallStrTrading({
            taxExempt: null,
            customerVatId: null,
            address: null,
        });
        expect(customer.customerId).not.toBeNull();
        expect(customer.customerId).not.toBeUndefined();
    });

    test.each([TaxExempt.Exempt, TaxExempt.None])('Create customer with tax exempt %s', async (taxExempt) => {
        const customer = await setupCustomerWallStrTrading({
            taxExempt,
        });
        expect(customer.customerId).not.toBeNull();
        expect(customer.customerId).not.toBeUndefined();
    });

    test('Create customer with invalid tax exempt', async () => {
        try {
            await setupCustomerWallStrTrading({
                // @ts-ignore
                taxExempt: 'taxExempt',
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create a simple customer', async () => {
        const customer = await setupCustomerWallStrTrading();
        expect(customer.customerId).not.toBeNull();
        expect(customer.customerId).not.toBeUndefined();
    });

    test('Create a customer with upper case country code', async () => {
        try {
            await setupCustomerWallStrTrading({
                address: new Address('US', '94105', 'San Francisco', 'CA', '1 Market St', ''),
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create a customer with three letter country code', async () => {
        try {
            await setupCustomerWallStrTrading({
                address: new Address('chn', '94105', 'San Francisco', 'CA', '1 Market St', ''),
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }

        try {
            await setupCustomerWallStrTrading({
                address: new Address('CHN', '94105', 'San Francisco', 'CA', '1 Market St', ''),
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create a customer with full country name', async () => {
        try {
            await setupCustomerWallStrTrading({
                address: new Address('United States', '94105', 'San Francisco', 'CA', '1 Market St', ''),
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create a customer with full state name', async () => {
        try {
            await setupCustomerWallStrTrading({
                address: new Address('United States', '94105', 'San Francisco', 'California', '1 Market St', ''),
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create a customer with upper case state code', async () => {
        const customer = await setupCustomerWallStrTrading({
            address: new Address('us', '94105', 'San Francisco', 'CA', '1 Market St', ''),
        });
        expect(customer.customerId).not.toBeNull();
        expect(customer.customerId).not.toBeUndefined();
    });

    test('Create a customer with country and state mismatch', async () => {
        try {
            await setupCustomerWallStrTrading({
                address: new Address('us', '94105', 'San Francisco', 'London', '1 Market St', ''),
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
        }
    });

    test('Create a customer with wrong zipcode', async () => {
        const customer = await setupCustomerWallStrTrading({
            address: new Address('us', '941005', 'San Francisco', 'CA', '1 Market St', ''),
        });
        expect(customer.customerId).not.toBeNull();
        expect(customer.customerId).not.toBeUndefined();
    });

    test('Create customer with an improper offeringId should fail', async () => {
        try {
            await setupCustomerWallStrTrading({
                offeringId: '123',
            });
        } catch (e) {
            expect(e.statusCode).toBe(400);
            expect(e.message[0]).toEqual(expect.stringContaining('offeringId'));
        }
    });
    test('Create customer with a valid offeringId should pass', async () => {
        const dimension = await setupDimensionRequest(null, AggregationMethod.Sum);
        const offering = await setupSimpleOffering([dimension.dimensionId]);
        const customer = await setupCustomerWallStrTrading({
            offeringId: offering.offeringId,
        });
        await sleep(1500);
        const fullCustomerInformation = (await customer.get()) as Customer;
        console.log(fullCustomerInformation);
        expect(customer.customerId).toStrictEqual(expect.any(String));
        expect(fullCustomerInformation?.offering?.offeringId).toEqual(offering.offeringId);
    });
    test.each(ADDRESS_INPUT)('Create a customer with address %s', async (address) => {
        const customer = await setupCustomerWallStrTrading({
            address: new Address(
                address.countryCode,
                address.postalCode,
                address.city,
                address.state,
                address.street,
                address.street2
            ),
        });
        expect(customer.customerId).not.toBeNull();
        expect(customer.customerId).not.toBeUndefined();
    });
});
