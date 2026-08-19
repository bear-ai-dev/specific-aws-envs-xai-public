import { Offering } from './offeringPackage.entity.js';
import { OfferingType } from './OfferingType.js';
import { InvoiceLineItems } from '../../invoice/entities/invoice.entity.js';
import { OfferingVisibility, ValidBillingCycles } from '../dto/createOffering.dto.js';
import { ReadOfferingResponseData } from '../dto/readOffering.dto.js';
import { AggregatedUsageResponse } from '../../customer/dto/read-customer.dto.js';
import { ReadSettingsResponseData } from '../../setting/dto/read-setting.dto.js';
import { FreeDimensionOnInvoice } from '../../setting/dto/FreeDimensionOnInvoice.js';
import {
    aggregationInterval,
    aggregationMethod,
    countBasedUnits,
    overageAllowedEnum,
    roundingEnum,
} from '../../dimensions/dto/create-dimension.dto.js';

const dimension = (overrides: Record<string, unknown>) =>
    ({
        aggregationInterval: aggregationInterval.hour,
        aggregationMethod: aggregationMethod.sum,
        rounding: roundingEnum.round,
        consumptionUnit: { unit: countBasedUnits['count-based'], type: 'count' },
        usageIncrement: '1',
        dimensionId: 'dimension',
        dimensionName: 'Dimension',
        ...overrides,
    }) as unknown as ReadOfferingResponseData['dimensions'][0];

const usageFor = (dimensionId: string, value: number): AggregatedUsageResponse =>
    ({
        offeringId: 'offering',
        dimensionId,
        usage: [{ value: `${value}`, startTime: '2026-07-02T00:00:00Z', endTime: '2026-07-02T00:00:00Z' }],
    }) as unknown as AggregatedUsageResponse;

const linesFor = async ({
    dimensions,
    usage,
    freeDimensionOnInvoice = FreeDimensionOnInvoice.show,
}: {
    dimensions: ReadOfferingResponseData['dimensions'];
    usage: AggregatedUsageResponse[];
    freeDimensionOnInvoice?: FreeDimensionOnInvoice;
}) => {
    const lineItems = new InvoiceLineItems();
    await Offering.getLineItemsForUsage({
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-08-01T00:00:00Z'),
        lineItems,
        negative: false,
        businessID: 'businessID',
        customerId: 'customerId',
        customerService: undefined,
        dimensions,
        offeringInstance: Offering.getInstance(
            {
                offeringId: 'offering',
                offeringName: 'Plan',
                offeringType: OfferingType.usageBased,
                billingCycle: ValidBillingCycles.monthly,
                offeringVisibility: OfferingVisibility.public,
                dimensions,
            } as unknown as ReadOfferingResponseData,
            'customerId',
            'businessID',
            undefined,
            { freeDimensionOnInvoice } as ReadSettingsResponseData,
            undefined,
            undefined,
            undefined,
            usage,
        ),
    });
    return lineItems.getLineItems();
};

describe('Allowances, overage and free dimensions on metered lines', () => {
    test('a dimension without an allowance is owed for in full', async () => {
        await expect(
            linesFor({
                dimensions: [dimension({ consumptionPrice: '2' })],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([expect.objectContaining({ name: 'Dimension - Plan', quantity: 30, unitCost: 2 })]);
    });

    test('only the usage past an exhausted allowance is charged when overage is permitted', async () => {
        await expect(
            linesFor({
                dimensions: [
                    dimension({
                        consumptionPrice: '2',
                        usageEntitlement: 10,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([expect.objectContaining({ name: 'Dimension - Plan', quantity: 20, unitCost: 2 })]);
    });

    test('an allowance which is not exhausted leaves nothing owed and earns no line', async () => {
        await expect(
            linesFor({
                dimensions: [
                    dimension({
                        consumptionPrice: '2',
                        usageEntitlement: 40,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([]);
    });

    test('an allowance consumed exactly leaves nothing owed', async () => {
        await expect(
            linesFor({
                dimensions: [
                    dimension({
                        consumptionPrice: '2',
                        usageEntitlement: 30,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([]);
    });

    test('an unlimited allowance can never be exhausted', async () => {
        await expect(
            linesFor({
                dimensions: [
                    dimension({
                        consumptionPrice: '2',
                        usageEntitlement: 'inf',
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([]);
    });

    test('a plan which forbids overage charges nothing past the allowance', async () => {
        await expect(
            linesFor({
                dimensions: [
                    dimension({
                        consumptionPrice: '2',
                        usageEntitlement: 10,
                        overageAllowed: overageAllowedEnum.false,
                    }),
                ],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([]);
    });

    test('a plan which never permitted overage charges nothing past the allowance', async () => {
        await expect(
            linesFor({
                dimensions: [dimension({ consumptionPrice: '2', usageEntitlement: 10 })],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([]);
    });

    test('a dimension priced at zero reports the quantity owed for', async () => {
        await expect(
            linesFor({
                dimensions: [dimension({ consumptionPrice: '0.00' })],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([expect.objectContaining({ name: 'Dimension - Plan', quantity: 30, unitCost: 0 })]);
    });

    test('a dimension priced at zero is left off when the invoice settings hide free dimensions', async () => {
        await expect(
            linesFor({
                dimensions: [dimension({ consumptionPrice: '0.00' })],
                usage: [usageFor('dimension', 30)],
                freeDimensionOnInvoice: FreeDimensionOnInvoice.hide,
            }),
        ).resolves.toEqual([]);
    });

    test('a dimension priced at zero reports only what its allowance does not cover', async () => {
        await expect(
            linesFor({
                dimensions: [
                    dimension({
                        consumptionPrice: '0',
                        usageEntitlement: 10,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [usageFor('dimension', 30)],
            }),
        ).resolves.toEqual([expect.objectContaining({ name: 'Dimension - Plan', quantity: 20, unitCost: 0 })]);
    });

    test('the usage increment applies to the quantity owed for', async () => {
        await expect(
            linesFor({
                dimensions: [
                    dimension({
                        consumptionPrice: '2',
                        usageIncrement: '10',
                        usageEntitlement: 100,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                usage: [usageFor('dimension', 300)],
            }),
        ).resolves.toEqual([expect.objectContaining({ quantity: 20, unitCost: 2 })]);
    });

    test('a charged dimension with no usage at all earns no line', async () => {
        await expect(
            linesFor({
                dimensions: [dimension({ consumptionPrice: '2' })],
                usage: [usageFor('someOtherDimension', 30)],
            }),
        ).resolves.toEqual([]);
    });
});
