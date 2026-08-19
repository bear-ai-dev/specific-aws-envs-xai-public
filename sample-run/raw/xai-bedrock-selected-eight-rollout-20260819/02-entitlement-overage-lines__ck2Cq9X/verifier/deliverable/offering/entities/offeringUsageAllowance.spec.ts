import {
    aggregationInterval,
    aggregationMethod,
    countBasedUnits,
    overageAllowedEnum,
    roundingEnum,
} from '../../dimensions/dto/create-dimension.dto.js';
import { AggregatedUsageResponse } from '../../customer/dto/read-customer.dto.js';
import { InvoiceLineItems } from '../../invoice/entities/invoice.entity.js';
import { ReadOfferingResponseData } from '../dto/readOffering.dto.js';
import { ReadSettingsResponseData } from '../../setting/dto/read-setting.dto.js';
import { FreeDimensionOnInvoice } from '../../setting/dto/FreeDimensionOnInvoice.js';
import { SupportedCurrencies } from '../dto/SupportedCurrencies.js';
import { ValidBillingCycles } from '../dto/createOffering.dto.js';
import { OfferingType } from './OfferingType.js';
import { Offering } from './offeringPackage.entity.js';

jest.mock('../../analytics/analytics.service', () => ({
    AnalyticsService: {
        getExchangeRate: jest.fn(() => 0.91),
    },
}));

const businessID = 'fakeBusinessID';
const customerId = 'fakeCustomerID';
const startDate = new Date('2023-07-01T00:00:00.000Z');
const endDate = new Date('2023-08-01T00:00:00.000Z');

const dimension = (overrides: Partial<ReadOfferingResponseData['dimensions'][0]> = {}) =>
    ({
        dimensionId: 'dim',
        dimensionName: 'fakeDimensionName',
        aggregationInterval: aggregationInterval.hour,
        aggregationMethod: aggregationMethod.sum,
        rounding: roundingEnum.round,
        usageIncrement: '1',
        consumptionPrice: '2',
        consumptionUnit: {
            unit: countBasedUnits['count-based'],
            type: 'count',
        },
        ...overrides,
    }) as ReadOfferingResponseData['dimensions'][0];

const gather = async ({
    dimensions,
    usage,
    freeDimensionOnInvoice = FreeDimensionOnInvoice.show,
}: {
    dimensions: ReadOfferingResponseData['dimensions'];
    usage: number;
    freeDimensionOnInvoice?: FreeDimensionOnInvoice;
}) => {
    const offering: ReadOfferingResponseData = {
        offeringId: 'offering',
        offeringName: 'foobar',
        offeringType: OfferingType.usageBased,
        currency: SupportedCurrencies.USD,
        billingCycle: ValidBillingCycles.monthly,
        dimensions,
    };
    const usageOverrides: AggregatedUsageResponse[] = dimensions.map(({ dimensionId }) => ({
        offeringId: offering.offeringId,
        dimensionId,
        usage: [
            {
                value: usage.toString(),
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
            },
        ],
    }));
    const lineItems = await Offering.getLineItemsForUsage({
        startDate,
        endDate,
        lineItems: new InvoiceLineItems(),
        negative: false,
        businessID,
        customerId,
        customerService: undefined,
        dimensions,
        offeringInstance: Offering.getInstance(
            offering,
            customerId,
            businessID,
            undefined,
            { freeDimensionOnInvoice } as ReadSettingsResponseData,
            undefined,
            undefined,
            undefined,
            usageOverrides,
        ),
    });
    return lineItems.getLineItems();
};

describe('Usage allowances and overage on invoice lines', () => {
    test('a dimension without an allowance is billed for everything it recorded', async () => {
        expect(await gather({ dimensions: [dimension()], usage: 30 })).toEqual([
            expect.objectContaining({ name: 'fakeDimensionName - foobar', quantity: 30, unitCost: 2 }),
        ]);
    });

    test('only the usage beyond an exhausted allowance is charged for when overage is permitted', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 10, overageAllowed: overageAllowedEnum.true })],
                usage: 30,
            }),
        ).toEqual([expect.objectContaining({ name: 'fakeDimensionName - foobar', quantity: 20, unitCost: 2 })]);
    });

    test('an allowance which was never exhausted is not charged for and earns no line', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 100, overageAllowed: overageAllowedEnum.true })],
                usage: 30,
            }),
        ).toEqual([]);
    });

    test('an unlimited allowance is never charged for', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 'inf', overageAllowed: overageAllowedEnum.true })],
                usage: 30,
            }),
        ).toEqual([]);
    });

    test('a dimension which forbids overage is not charged for beyond its allowance', async () => {
        expect(
            await gather({
                dimensions: [dimension({ usageEntitlement: 10, overageAllowed: overageAllowedEnum.false })],
                usage: 30,
            }),
        ).toEqual([]);
        expect(await gather({ dimensions: [dimension({ usageEntitlement: 10 })], usage: 30 })).toEqual([]);
    });

    test('a dimension priced at zero is listed with the quantity owed for when free dimensions are shown', async () => {
        expect(await gather({ dimensions: [dimension({ consumptionPrice: '0' })], usage: 30 })).toEqual([
            expect.objectContaining({ name: 'fakeDimensionName - foobar', quantity: 30, unitCost: 0 }),
        ]);
    });

    test('a dimension priced at zero is left off when the settings hide free dimensions', async () => {
        expect(
            await gather({
                dimensions: [dimension({ consumptionPrice: '0' })],
                usage: 30,
                freeDimensionOnInvoice: FreeDimensionOnInvoice.hide,
            }),
        ).toEqual([]);
    });
});
