import { CustomerService } from '../../customer/customer.service.js';
import { ReadCustomerUsageData } from '../../customer/dto/read-customer.dto.js';
import {
    aggregationInterval,
    aggregationMethod,
    countBasedUnits,
    overageAllowedEnum,
    roundingEnum,
} from '../../dimensions/dto/create-dimension.dto.js';
import { InvoiceLineItem, InvoiceLineItems } from '../../invoice/entities/invoice.entity.js';
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
const startDate = new Date('2023-07-01T00:00:00Z');
const endDate = new Date('2023-08-01T00:00:00Z');

const dimension = (overrides: Record<string, unknown> = {}) =>
    ({
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
        consumptionPrice: '2',
        ...overrides,
    }) as ReadOfferingResponseData['dimensions'][0];

const gatherLines = async ({
    dimensions,
    total,
    freeDimensionOnInvoice = FreeDimensionOnInvoice.show,
}: {
    dimensions: ReadOfferingResponseData['dimensions'];
    total: string;
    freeDimensionOnInvoice?: FreeDimensionOnInvoice;
}): Promise<InvoiceLineItem[]> => {
    //eslint-disable-next-line
    //@ts-ignore
    const invoicesService: InvoicesService = new InvoicesService();
    //eslint-disable-next-line
    //@ts-ignore
    const customerService: CustomerService = new CustomerService();
    jest.spyOn(customerService, 'findUsageForCustomer').mockImplementation(
        async () =>
            ({
                message: 'fake',
                data: dimensions.map(({ dimensionId }) => ({
                    dimensionId,
                    usage: [{ startTime: startDate.toISOString(), endTime: endDate.toISOString(), value: total }],
                })),
            }) as ReadCustomerUsageData,
    );
    const offeringConfig: ReadOfferingResponseData = {
        offeringId: 'off-1',
        offeringName: 'Plan',
        offeringType: OfferingType.usageBased,
        currency: SupportedCurrencies.USD,
        billingCycle: ValidBillingCycles.monthly,
        dimensions,
    } as ReadOfferingResponseData;
    const lineItems = await Offering.getLineItemsForUsage({
        startDate,
        endDate,
        businessID,
        customerId,
        customerService,
        dimensions,
        lineItems: new InvoiceLineItems(),
        negative: false,
        offeringInstance: Offering.getInstance(
            offeringConfig,
            customerId,
            businessID,
            invoicesService,
            { freeDimensionOnInvoice } as ReadSettingsResponseData,
            undefined,
            customerService,
        ),
    });
    return lineItems.getLineItems();
};

describe('Allowances, overage and free dimensions on metered lines', () => {
    test('a dimension without an allowance is charged for everything measured', async () => {
        expect(await gatherLines({ dimensions: [dimension()], total: '30' })).toEqual([
            expect.objectContaining(new InvoiceLineItem('Widgets - Plan', 30, 2)),
        ]);
    });

    test('an unexhausted allowance charges nothing and earns no line', async () => {
        expect(
            await gatherLines({
                dimensions: [dimension({ usageEntitlement: 100, overageAllowed: overageAllowedEnum.true })],
                total: '30',
            }),
        ).toEqual([]);
    });

    test('an exhausted allowance only charges the permitted overage', async () => {
        expect(
            await gatherLines({
                dimensions: [dimension({ usageEntitlement: 100, overageAllowed: overageAllowedEnum.true })],
                total: '130',
            }),
        ).toEqual([expect.objectContaining(new InvoiceLineItem('Widgets - Plan', 30, 2))]);
    });

    test('an exhausted allowance charges nothing when the plan forbids overage', async () => {
        expect(
            await gatherLines({
                dimensions: [dimension({ usageEntitlement: 100, overageAllowed: overageAllowedEnum.false })],
                total: '130',
            }),
        ).toEqual([]);
    });

    test('an exhausted allowance charges nothing when the plan never permits overage', async () => {
        expect(
            await gatherLines({
                dimensions: [dimension({ usageEntitlement: 100 })],
                total: '130',
            }),
        ).toEqual([]);
    });

    test('an unlimited allowance charges nothing however much is used', async () => {
        expect(
            await gatherLines({
                dimensions: [dimension({ usageEntitlement: 'inf', overageAllowed: overageAllowedEnum.true })],
                total: '130',
            }),
        ).toEqual([]);
    });

    test('a dimension priced at zero is reported with the quantity owed for', async () => {
        expect(
            await gatherLines({
                dimensions: [dimension({ consumptionPrice: '0' })],
                total: '30',
            }),
        ).toEqual([expect.objectContaining(new InvoiceLineItem('Widgets - Plan', 30, 0))]);
    });

    test('a dimension priced at zero is left off when the business hides free dimensions', async () => {
        expect(
            await gatherLines({
                dimensions: [dimension({ consumptionPrice: '0' })],
                total: '30',
                freeDimensionOnInvoice: FreeDimensionOnInvoice.hide,
            }),
        ).toEqual([]);
    });

    test('a dimension priced at zero reports only the overage it owes for', async () => {
        expect(
            await gatherLines({
                dimensions: [
                    dimension({
                        consumptionPrice: '0.00',
                        usageEntitlement: 10,
                        overageAllowed: overageAllowedEnum.true,
                    }),
                ],
                total: '30',
            }),
        ).toEqual([expect.objectContaining(new InvoiceLineItem('Widgets - Plan', 20, 0))]);
    });

    test('only the dimensions the customer owes on are lined up', async () => {
        const lines = await gatherLines({
            dimensions: [
                dimension({ dimensionId: 'billed', dimensionName: 'Billed' }),
                dimension({
                    dimensionId: 'entitled',
                    dimensionName: 'Entitled',
                    usageEntitlement: 100,
                    overageAllowed: overageAllowedEnum.true,
                }),
                dimension({ dimensionId: 'free', dimensionName: 'Free', consumptionPrice: '0' }),
            ],
            total: '30',
            freeDimensionOnInvoice: FreeDimensionOnInvoice.hide,
        });
        expect(lines).toEqual([expect.objectContaining(new InvoiceLineItem('Billed - Plan', 30, 2))]);
    });
});
