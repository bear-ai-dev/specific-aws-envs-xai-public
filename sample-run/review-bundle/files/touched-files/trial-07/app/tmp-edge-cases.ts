import { Offering } from './src/offering/entities/offeringPackage.entity.js';
import { overageAllowedEnum } from './src/dimensions/dto/create-dimension.dto.js';
import { FreeDimensionOnInvoice } from './src/setting/dto/FreeDimensionOnInvoice.js';
import { InvoiceLineItems } from './src/invoice/entities/invoice.entity.js';
import { OfferingType } from './src/offering/entities/OfferingType.js';
import { ValidBillingCycles } from './src/offering/dto/createOffering.dto.js';
import { aggregationInterval, aggregationMethod, roundingEnum, countBasedUnits } from './src/dimensions/dto/create-dimension.dto.js';

function assert(cond: unknown, msg: string) {
    if (!cond) {
        throw new Error(msg);
    }
    console.log('ok:', msg);
}

async function main() {
    assert(Offering.chargeableQuantity({ usageTotal: 0 }) === 0, 'zero usage with no allowance');
    assert(Offering.chargeableQuantity({ usageTotal: 3.5 }) === 3.5, 'fractional usage with no allowance');
    assert(Offering.chargeableQuantity({ usageTotal: 10, usageEntitlement: 10, overageAllowed: overageAllowedEnum.true }) === 0, 'exactly exhausted allowance');
    assert(Offering.chargeableQuantity({ usageTotal: 10.5, usageEntitlement: 10, overageAllowed: overageAllowedEnum.true }) === 0.5, 'fractional overage');
    assert(Offering.chargeableQuantity({ usageTotal: 1, usageEntitlement: 0, overageAllowed: overageAllowedEnum.true }) === 1, 'zero allowance bills all usage');
    assert(Offering.chargeableQuantity({ usageTotal: 8, usageEntitlement: 0, overageAllowed: overageAllowedEnum.false }) === 0, 'zero allowance still forbids overage');
    assert(Offering.shouldIncludeDimensionLine({ quantity: 0.01, unitCost: 0, settings: { freeDimensionOnInvoice: FreeDimensionOnInvoice.show } as any }) === true, 'tiny free quantity shown');
    assert(Offering.shouldIncludeDimensionLine({ quantity: 0, unitCost: 0, settings: { freeDimensionOnInvoice: FreeDimensionOnInvoice.show } as any }) === false, 'zero free quantity hidden even when show');
    assert(Offering.shouldIncludeDimensionLine({ quantity: 4, unitCost: 0, settings: undefined }) === true, 'missing settings still show free lines');

    const dim = (overrides: Record<string, unknown>) => ({
        dimensionId: 'd',
        dimensionName: 'Dim',
        aggregationInterval: aggregationInterval.hour,
        aggregationMethod: aggregationMethod.sum,
        usageIncrement: '1',
        consumptionUnit: { unit: countBasedUnits['count-based'], type: 'count' },
        rounding: roundingEnum.round,
        consumptionPrice: '1.00',
        ...overrides,
    });

    const offering = Offering.getInstance(
        {
            offeringId: 'off',
            offeringName: 'Plan',
            offeringType: OfferingType.usageBased,
            billingCycle: ValidBillingCycles.monthly,
            dimensions: [dim({ dimensionId: 'free', consumptionPrice: '0.00' })],
        } as any,
        'cus',
        'biz',
        undefined as any,
        { freeDimensionOnInvoice: FreeDimensionOnInvoice.show } as any,
        undefined,
        undefined,
        undefined,
        [{ dimensionId: 'free', usage: [{ value: '4', startTime: '2026-07-01T00:00:00Z', endTime: '2026-07-01T00:00:00Z' }] }],
    );

    const shown = await Offering.getLineItemsForUsage({
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-08-01T00:00:00Z'),
        lineItems: new InvoiceLineItems(),
        negative: false,
        businessID: 'biz',
        customerId: 'cus',
        customerService: undefined as any,
        dimensions: [dim({ dimensionId: 'free', consumptionPrice: '0.00' })],
        offeringInstance: offering,
    });
    assert(shown.getLineItems().length === 1, 'shown free dimension has a line');
    assert(shown.getLineItems()[0].quantity === 4, 'free line reports owed quantity');
    assert(shown.getLineItems()[0].unitCost === 0, 'free line keeps zero price');

    console.log('all edge cases passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
