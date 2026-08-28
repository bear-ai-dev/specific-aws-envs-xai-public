import { Service } from '../client/publicClient/service';
import { Offering, OfferingType } from '../client/publicClient/offering';
import { DatastorePlatform, Measurement, UsageRecordInS3Measurement } from '../client/publicClient/measurement';
import { Customer, TaxExempt } from '../client/publicClient/customer';
import { Address } from '../client/publicClient/init';
import { AggregationInterval, AggregationMethod, Dimension, OverageAllowed, Rounding } from '../client/publicClient/dimension';

export const setupCustomerWallStrTrading = async ({
    customerName = 'Wall Street Trading',
    email = 'matt.sun@meteringco.tech',
    paymentChannel = 'Stripe',
    paymentChannelOptions = { stripeCustomerId: 'acct-xxxxxxxxxxxxxxxx' },
    taxExempt = TaxExempt.None,
    customerVatId = 'VAT GB 1234567',
    address = new Address('us', 'W1J 8AJ', 'London', 'London', '1 Downing Street', ''),
}: {
    customerName?: string | null;
    email?: string | null;
    paymentChannel?: string | null;
    paymentChannelOptions?: { stripeCustomerId: string | null };
    taxExempt?: TaxExempt;
    customerVatId?: string | null;
    address?: Address;
} = {}) => {
    const customer = new Customer();
    await customer.create({
        customerName,
        email,
        taxExempt,
        address,
        paymentChannel,
        paymentChannelOptions,
        customerVatId,
    });
    return customer;
};

export const setupDimensionRequest = async (
    measurementId: string | null = null,
    aggregationMethod: AggregationMethod = AggregationMethod.Sum
) => {
    const dimension = new Dimension();
    await dimension.create({
        aggregationInterval: AggregationInterval.Hour,
        aggregationMethod,
        name: 'Request',
        consumptionPrice: '0.4',
        overageAllowed: OverageAllowed.False,
        usageEntitlement: 0,
        rounding: Rounding.Ceiling,
        usageIncrement: 1,
        consumptionUnit: {
            unit: 'count-based',
            type: 'count',
        },
        measurementId,
    });
    return dimension;
};

export const setupSimpleOffering = async (dimensionIds: string[]) => {
    const offering = new Offering();
    await offering.create({
        offeringType: OfferingType.UsageBased,
        offeringName: 'Simple Offering',
        dimensionIds,
    });
    return offering;
};

export const setupSimpleService = async (offeringId: string, customerId: string) => {
    const service = new Service();
    await service.create({
        offeringId,
        customerId,
        name: 'Simple Service',
    });
    return service;
};

export const setupS3Measurement = async (accountId: string = '123456789012') => {
    const measurement = new UsageRecordInS3Measurement();
    await measurement.create({
        name: 'Simple S3 Measurement',
        accountId,
    });
    return measurement;
};
