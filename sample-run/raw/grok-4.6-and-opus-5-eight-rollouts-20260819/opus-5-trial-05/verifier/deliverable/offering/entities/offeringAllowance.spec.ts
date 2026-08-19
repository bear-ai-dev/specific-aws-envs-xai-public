import { CustomerService } from '../../customer/customer.service.js';
import {
    aggregationInterval,
    aggregationMethod,
    countBasedUnits,
    overageAllowedEnum,
    roundingEnum,
} from '../../dimensions/dto/create-dimension.dto.js';
import { InvoiceLineItems } from '../../invoice/entities/invoice.entity.js';
import { InvoicesService } from '../../invoice/invoices.service.js';
import { FreeDimensionOnInvoice } from '../../setting/dto/FreeDimensionOnInvoice.js';
import { ReadSettingsResponseData } from '../../setting/dto/read-setting.dto.js';
import { ValidBillingCycles } from '../dto/createOffering.dto.js';
import { ReadOfferingResponseData } from '../dto/readOffering.dto.js';
import { SupportedCurrencies } from '../dto/SupportedCurrencies.js';
import { Offering } from './offeringPackage.entity.js';
import { OfferingType } from './OfferingType.js';

const businessID = 'fakeBusinessID';
const customerId = 'fakeCustomerID';
const startDate = new Date('2026-07-01T00:00:00Z');
const endDate = new Date('2026-08-01T00:00:00Z');

const baseDimension = {
    dimensionId: 'dim-1',
    dimensionName: 'Widgets',
    aggregationInterval: aggregationInterval.hour,
    aggregationMethod: aggregationMethod.sum,
    rounding: roundingEnum.round,
    usageIncrement: '1',
    consumptionUnit: {
        unit: countBasedUnits['count-based'],
        type: 'count',
    },
};

const gather = async ({
    dimension,
    usageValue,
    freeDimensionOnInvoice = FreeDimensionOnInvoice.show,
}: {
    dimension: Record<string, unknown>;
    usageValue: string;
    freeDimensionOnInvoice?: FreeDimensionOnInvoice;
}) => {
    const offeringConfig = {
        offeringId: 'off-1',
        offeringName: 'Plan',
        offeringType: OfferingType.usageBased,
        currency: SupportedCurrencies.USD,
        billingCycle: ValidBillingCycles.monthly,
        dimensions: [dimension],
    } as unknown as ReadOfferingResponseData;
    const offeringInstance = Offering.getInstance(
        offeringConfig,
        customerId,
        businessID,
        undefined as unknown as InvoicesService,
        { freeDimensionOnInvoice } as ReadSettingsResponseData,
        undefined,
        undefined,
        undefined,
        [
            {
                offeringId: 'off-1',
                dimensionId: `${dimension.dimensionId}`,
                usage: [
                    {
                        value: usageValue,
                        startTime: startDate.toISOString(),
                        endTime: endDate.toISOString(),
                    },
                ],
            },
        ],
    );
    const lineItems = await Offering.getLineItemsForUsage({
        startDate,
        endDate,
        lineItems: new InvoiceLineItems(),
        negative: false,
        businessID,
        customerId,
        customerService: undefined as unknown as CustomerService,
        dimensions: offeringConfig.dimensions,
        offeringInstance,
    });
    return lineItems.getLineItems();
};

describe('Allowances, overage and free dimensions on invoice lines', () => {
    test('a dimension without an allowance is charged for all of its usage', async () => {
        expect(await gather({ dimension: { ...baseDimension, consumptionPrice: '0.01' }, usageValue: '100' })).toEqual([
            expect.objectContaining({ name: 'Widgets - Plan', quantity: 100, unitCost: 0.01 }),
        ]);
    });

    test('only the usage past an exhausted allowance is charged when overage is permitted', async () => {
        expect(
            await gather({
                dimension: {
                    ...baseDimension,
                    consumptionPrice: '10.00',
                    usageEntitlement: 10,
                    overageAllowed: overageAllowedEnum.true,
                },
                usageValue: '12',
            }),
        ).toEqual([expect.objectContaining({ name: 'Widgets - Plan', quantity: 2, unitCost: 10 })]);
    });

    test('an allowance which has not been exhausted earns no line', async () => {
        expect(
            await gather({
                dimension: {
                    ...baseDimension,
                    consumptionPrice: '0.02',
                    usageEntitlement: 100,
                    overageAllowed: overageAllowedEnum.true,
                },
                usageValue: '80',
            }),
        ).toEqual([]);
    });

    test('an unlimited allowance earns no line', async () => {
        expect(
            await gather({
                dimension: {
                    ...baseDimension,
                    consumptionPrice: '0.50',
                    usageEntitlement: 'inf',
                    overageAllowed: overageAllowedEnum.true,
                },
                usageValue: '40',
            }),
        ).toEqual([]);
    });

    test('a plan which forbids overage charges nothing past the allowance', async () => {
        expect(
            await gather({
                dimension: {
                    ...baseDimension,
                    consumptionPrice: '1.00',
                    usageEntitlement: 5,
                    overageAllowed: overageAllowedEnum.false,
                },
                usageValue: '7',
            }),
        ).toEqual([]);
        expect(
            await gather({
                dimension: {
                    ...baseDimension,
                    consumptionPrice: '0.10',
                    usageEntitlement: 50,
                },
                usageValue: '70',
            }),
        ).toEqual([]);
    });

    test('a dimension priced at zero is listed with the quantity owed for when free dimensions are shown', async () => {
        expect(await gather({ dimension: { ...baseDimension, consumptionPrice: '0' }, usageValue: '10' })).toEqual([
            expect.objectContaining({ name: 'Widgets - Plan', quantity: 10, unitCost: 0 }),
        ]);
    });

    test('a dimension priced at zero is dropped when the settings hide free dimensions', async () => {
        expect(
            await gather({
                dimension: { ...baseDimension, consumptionPrice: '0.00' },
                usageValue: '10',
                freeDimensionOnInvoice: FreeDimensionOnInvoice.hide,
            }),
        ).toEqual([]);
    });
});
