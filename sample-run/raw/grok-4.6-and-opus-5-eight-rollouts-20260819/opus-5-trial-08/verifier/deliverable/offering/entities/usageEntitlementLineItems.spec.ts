import {
    PaymentSchedule,
    aggregationInterval,
    aggregationMethod,
    countBasedUnits,
    overageAllowedEnum,
    roundingEnum,
} from '../../dimensions/dto/create-dimension.dto.js';
import { InvoiceLineItems } from '../../invoice/entities/invoice.entity.js';
import { FreeDimensionOnInvoice } from '../../setting/dto/FreeDimensionOnInvoice.js';
import { ReadSettingsResponseData } from '../../setting/dto/read-setting.dto.js';
import { ValidBillingCycles } from '../dto/createOffering.dto.js';
import { ReadOfferingResponseData } from '../dto/readOffering.dto.js';
import { SupportedCurrencies } from '../dto/SupportedCurrencies.js';
import { Offering } from './offeringPackage.entity.js';
import { OfferingType } from './OfferingType.js';

const startDate = new Date('2026-07-01T00:00:00.000Z');
const endDate = new Date('2026-08-01T00:00:00.000Z');

const dimension = (overrides: Record<string, unknown>) => ({
    dimensionId: 'dim',
    dimensionName: 'Widgets',
    consumptionPrice: '2',
    usageIncrement: '1',
    rounding: roundingEnum.round,
    aggregationInterval: aggregationInterval.hour,
    aggregationMethod: aggregationMethod.sum,
    paymentSchedule: PaymentSchedule.arrear,
    consumptionUnit: { unit: countBasedUnits['count-based'], type: 'count' },
    ...overrides,
});

const gather = async ({
    dimensions,
    usage,
    freeDimensionOnInvoice = FreeDimensionOnInvoice.show,
}: {
    dimensions: Array<Record<string, unknown>>;
    usage: Array<{ dimensionId: string; value: string }>;
    freeDimensionOnInvoice?: FreeDimensionOnInvoice;
}) => {
    const offeringConfig = {
        offeringId: 'off',
        offeringName: 'Plan',
        offeringType: OfferingType.usageBased,
        currency: SupportedCurrencies.USD,
        billingCycle: ValidBillingCycles.monthly,
        dimensions,
    } as unknown as ReadOfferingResponseData;
    const offeringInstance = Offering.getInstance(
        offeringConfig,
        'customer',
        'business',
        undefined,
        { freeDimensionOnInvoice } as ReadSettingsResponseData,
        undefined,
        undefined,
        undefined,
        usage.map(({ dimensionId, value }) => ({
            dimensionId,
            usage: [{ value, startTime: startDate.toISOString(), endTime: endDate.toISOString() }],
        })),
    );
    const lineItems = new InvoiceLineItems();
    await Offering.getLineItemsForUsage({
        startDate,
        endDate,
        lineItems,
        businessID: 'business',
        customerId: 'customer',
        customerService: undefined,
        dimensions: offeringConfig.dimensions,
        offeringInstance,
    });
    return lineItems.getLineItems().map(({ name, quantity, unitCost }) => ({ name, quantity, unitCost }));
};

describe('Usage entitlements and free dimensions on invoice lines', () => {
    test('a dimension without an entitlement bills every unit of usage', async () => {
        expect(await gather({ dimensions: [dimension({})], usage: [{ dimensionId: 'dim', value: '30' }] })).toEqual([
            { name: 'Widgets - Plan', quantity: 30, unitCost: 2 },
        ]);
    });

    test('only the usage beyond an exhausted entitlement is billed', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 10, overageAllowed: overageAllowedEnum.true })],
                usage: [{ dimensionId: 'dim', value: '30' }],
            }),
        ).toEqual([{ name: 'Widgets - Plan', quantity: 20, unitCost: 2 }]);
    });

    test('an entitlement that is not exhausted bills nothing and carries no line', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 100, overageAllowed: overageAllowedEnum.true })],
                usage: [{ dimensionId: 'dim', value: '30' }],
            }),
        ).toEqual([]);
    });

    test('an unlimited entitlement bills nothing and carries no line', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 'inf', overageAllowed: overageAllowedEnum.true })],
                usage: [{ dimensionId: 'dim', value: '30' }],
            }),
        ).toEqual([]);
    });

    test('an entitlement the plan forbids overage on bills nothing and carries no line', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 10, overageAllowed: overageAllowedEnum.false })],
                usage: [{ dimensionId: 'dim', value: '30' }],
            }),
        ).toEqual([]);
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 10 })],
                usage: [{ dimensionId: 'dim', value: '30' }],
            }),
        ).toEqual([]);
    });

    test('a priced dimension with no usage carries no line', async () => {
        expect(
            await gather({
                dimensions: [dimension({}), dimension({ dimensionId: 'other', dimensionName: 'Other' })],
                usage: [{ dimensionId: 'other', value: '3' }],
            }),
        ).toEqual([{ name: 'Other - Plan', quantity: 3, unitCost: 2 }]);
    });

    test('a dimension priced at zero carries a line reporting the owed quantity', async () => {
        expect(
            await gather({
                dimensions: [dimension({ consumptionPrice: '0' })],
                usage: [{ dimensionId: 'dim', value: '30' }],
            }),
        ).toEqual([{ name: 'Widgets - Plan', quantity: 30, unitCost: 0 }]);
        expect(
            await gather({
                dimensions: [
                    dimension({
                        consumptionPrice: '0',
                        usageEntitlement: 10,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [{ dimensionId: 'dim', value: '30' }],
            }),
        ).toEqual([{ name: 'Widgets - Plan', quantity: 20, unitCost: 0 }]);
    });

    test('a dimension priced at zero is left off when the settings hide free dimensions', async () => {
        expect(
            await gather({
                dimensions: [dimension({ consumptionPrice: '0' })],
                usage: [{ dimensionId: 'dim', value: '30' }],
                freeDimensionOnInvoice: FreeDimensionOnInvoice.hide,
            }),
        ).toEqual([]);
    });

    test('entitlements are taken off before the usage increment is applied', async () => {
        expect(
            await gather({
                dimensions: [
                    dimension({
                        usageIncrement: '10',
                        usageEntitlement: 100,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [{ dimensionId: 'dim', value: '150' }],
            }),
        ).toEqual([{ name: 'Widgets - Plan', quantity: 5, unitCost: 2 }]);
    });
});
