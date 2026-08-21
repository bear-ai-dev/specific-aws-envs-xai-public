import { TaxService } from './tax.service.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { AuditService } from '../audit/audit.service.js';
import { InvoiceLineItems, InvoiceLineItem } from '../invoice/entities/invoice.entity.js';

jest.mock('taxjar', () => {
    const taxForOrder = jest.fn();
    const createOrder = jest.fn();
    const categories = jest.fn();
    const ctor = jest.fn().mockImplementation(() => ({
        taxForOrder,
        createOrder,
        categories,
    }));
    ctor.__mocks = { taxForOrder, createOrder, categories };
    return ctor;
});

import Taxjar from 'taxjar';

const mockedTaxjar = Taxjar as unknown as jest.Mock & {
    __mocks: { taxForOrder: jest.Mock; createOrder: jest.Mock; categories: jest.Mock };
};

const makeLineItems = () => {
    const items = new InvoiceLineItems();
    items.addLineItem(new InvoiceLineItem('Compute Hours', 10, 0.4));
    return items;
};

describe('TaxService', () => {
    let service: TaxService;
    const originalTaxJarUrl = process.env.TAX_JAR_URL;
    const originalProdTaxJarUrl = process.env.PROD_TAX_JAR_URL;

    beforeEach(() => {
        service = new TaxService();
        process.env.TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/sandbox';
        process.env.PROD_TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/production';
        mockedTaxjar.mockClear();
        mockedTaxjar.__mocks.taxForOrder.mockReset();
        mockedTaxjar.__mocks.createOrder.mockReset();
        mockedTaxjar.__mocks.categories.mockReset();
        jest.spyOn(AuditService, 'publishEvent').mockImplementation(() => undefined as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(() => {
        process.env.TAX_JAR_URL = originalTaxJarUrl;
        process.env.PROD_TAX_JAR_URL = originalProdTaxJarUrl;
    });

    it('charges nothing when the customer is tax exempt, regardless of business configuration', async () => {
        const result = await service.calculateTax({
            invoice: { totalAmountWithoutTax: 100, invoiceLineItems: makeLineItems() },
            settings: {
                taxCalculationType: TaxCalculationType.manual,
                taxRate: '0.2',
            } as any,
            customer: { customerId: 'cust-1', taxExempt: TaxExempt.exempt },
        });
        expect(result).toEqual({ salesTaxRate: 0, taxAmount: 0 });
        expect(mockedTaxjar).not.toHaveBeenCalled();
    });

    it('charges nothing when the business collects no tax', async () => {
        const result = await service.calculateTax({
            invoice: { totalAmountWithoutTax: 100, invoiceLineItems: makeLineItems() },
            settings: { taxCalculationType: TaxCalculationType.none } as any,
            customer: { customerId: 'cust-1', taxExempt: TaxExempt.none },
        });
        expect(result).toEqual({ salesTaxRate: 0, taxAmount: 0 });
    });

    it('applies the rate the business maintains itself', async () => {
        const result = await service.calculateTax({
            invoice: { totalAmountWithoutTax: 100, invoiceLineItems: makeLineItems() },
            settings: { taxCalculationType: TaxCalculationType.manual, taxRate: '0.08' } as any,
            customer: { customerId: 'cust-1', taxExempt: TaxExempt.none },
        });
        expect(result).toEqual({ salesTaxRate: 0.08, taxAmount: 8 });
    });

    it('prices a destination against TaxJar with both addresses, lines and product category', async () => {
        mockedTaxjar.__mocks.taxForOrder.mockResolvedValue({
            tax: { rate: 0.08, amount_to_collect: 0.32 },
        });

        const invoice = {
            invoiceId: 'inv-1',
            totalAmountWithoutTax: 4,
            invoiceLineItems: makeLineItems(),
            fromCountry: 'gb',
            fromPostalCode: 'W1J 8AJ',
            fromState: 'London',
            fromCity: 'London',
            fromStreetLine1: '1 Downing Street',
            toCountry: 'us',
            toPostalCode: '14522',
            toState: 'NY',
            toCity: 'Palmyra',
            toStreetLine1: '259 Fayette St',
        };

        const result = await service.calculateTax({
            invoice,
            settings: {
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxJarApiKey: 'sandbox-key',
                taxCategory: '31000',
                accountState: AccountState.sandbox,
            } as any,
            customer: { customerId: 'cust-1', taxExempt: TaxExempt.none },
        });

        expect(result).toEqual({ salesTaxRate: 0.08, taxAmount: 0.32 });
        expect(mockedTaxjar).toHaveBeenCalledWith({
            apiKey: 'sandbox-key',
            apiUrl: 'http://127.0.0.1:4566/taxjar/sandbox',
        });
        expect(mockedTaxjar.__mocks.taxForOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                from_country: 'GB',
                to_country: 'US',
                from_zip: 'W1J 8AJ',
                to_zip: '14522',
                amount: 4,
                shipping: 0,
                line_items: [
                    expect.objectContaining({
                        quantity: 10,
                        unit_price: 0.4,
                        product_tax_code: '31000',
                    }),
                ],
            }),
        );
    });

    it('uses the production authority for production accounts', async () => {
        mockedTaxjar.__mocks.taxForOrder.mockResolvedValue({
            tax: { rate: 0.1, amount_to_collect: 10 },
        });
        await service.calculateTax({
            invoice: { totalAmountWithoutTax: 100, invoiceLineItems: makeLineItems() },
            settings: {
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxJarApiKey: 'prod-key',
                accountState: AccountState.production,
                country: 'us',
            } as any,
            customer: {
                taxExempt: TaxExempt.none,
                address: { countryCode: 'us', postalCode: '10001', state: 'NY', city: 'NYC', streetLineOne: '1 St' },
            },
        });
        expect(mockedTaxjar).toHaveBeenCalledWith({
            apiKey: 'prod-key',
            apiUrl: 'http://127.0.0.1:4566/taxjar/production',
        });
    });

    it('reports a refused address without stopping the invoice', async () => {
        mockedTaxjar.__mocks.taxForOrder.mockRejectedValue({
            error: 'Bad Request',
            detail: 'to_zip is not a valid postal code for to_country.',
            status: 400,
        });
        const result = await service.calculateTax({
            invoice: {
                invoiceId: 'inv-bad-addr',
                totalAmountWithoutTax: 100,
                invoiceLineItems: makeLineItems(),
                toCountry: 'us',
                toPostalCode: '00000',
            },
            settings: {
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxJarApiKey: 'sandbox-key',
                accountState: AccountState.sandbox,
            } as any,
            customer: { taxExempt: TaxExempt.none },
        });
        expect(result).toEqual({ salesTaxRate: 0, taxAmount: 0 });
        expect(AuditService.publishEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('TaxJar refused address'),
            }),
        );
    });

    it('files a settled sale back to the authority under the invoice number', async () => {
        mockedTaxjar.__mocks.createOrder.mockResolvedValue({ order: { transaction_id: 'inv-paid' } });
        await service.createOrder({
            invoice: {
                invoiceId: 'inv-paid',
                totalAmountWithoutTax: 4,
                taxAmount: 0.32,
                invoiceDate: new Date('2024-01-01T00:00:00.000Z'),
                invoiceLineItems: makeLineItems(),
                fromCountry: 'us',
                fromPostalCode: '94105',
                fromState: 'CA',
                fromCity: 'San Francisco',
                fromStreetLine1: '123 Main St',
                toCountry: 'us',
                toPostalCode: '14522',
                toState: 'NY',
                toCity: 'Palmyra',
                toStreetLine1: '259 Fayette St',
            },
            settings: {
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxJarApiKey: 'sandbox-key',
                taxCategory: '31000',
                accountState: AccountState.sandbox,
            } as any,
        });
        expect(mockedTaxjar.__mocks.createOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                transaction_id: 'inv-paid',
                amount: 4,
                sales_tax: 0.32,
            }),
        );
    });

    it('does not file an order when the business is not using destination tax', async () => {
        await service.createOrder({
            invoice: { invoiceId: 'inv-manual', totalAmountWithoutTax: 10, taxAmount: 1 },
            settings: { taxCalculationType: TaxCalculationType.manual, taxRate: '0.1' } as any,
        });
        expect(mockedTaxjar.__mocks.createOrder).not.toHaveBeenCalled();
    });

    it('recognizes European parties for VAT display', () => {
        expect(TaxService.areBothPartiesEuropean('gb', 'de')).toBe(true);
        expect(TaxService.areBothPartiesEuropean('uk', 'fr')).toBe(true);
        expect(TaxService.areBothPartiesEuropean('us', 'de')).toBe(false);
        expect(TaxService.areBothPartiesEuropean('us', 'us')).toBe(false);
    });

    it('normalizes country codes for the authority', () => {
        expect(TaxService.normalizeCountry('uk')).toBe('GB');
        expect(TaxService.normalizeCountry('gb')).toBe('GB');
        expect(TaxService.normalizeCountry('us')).toBe('US');
        expect(TaxService.normalizeCountry('usa')).toBe('US');
        expect(TaxService.normalizeCountry('el')).toBe('GR');
    });

    it('treats a percentage-style manual rate as a decimal', async () => {
        const result = await service.calculateTax({
            invoice: { totalAmountWithoutTax: 50, invoiceLineItems: makeLineItems() },
            settings: { taxCalculationType: TaxCalculationType.manual, taxRate: '20' } as any,
            customer: { customerId: 'cust-1', taxExempt: TaxExempt.none },
        });
        expect(result).toEqual({ salesTaxRate: 0.2, taxAmount: 10 });
    });

    it('returns zero tax when a destination request has no TaxJar key and the client rejects it', async () => {
        mockedTaxjar.mockImplementationOnce(() => {
            throw new Error('Please provide a TaxJar API key');
        });
        const result = await service.calculateTax({
            invoice: { invoiceId: 'inv-nokey', totalAmountWithoutTax: 10 },
            settings: {
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                accountState: AccountState.sandbox,
            } as any,
            customer: { taxExempt: TaxExempt.none },
        });
        expect(result).toEqual({ salesTaxRate: 0, taxAmount: 0 });
        expect(AuditService.publishEvent).toHaveBeenCalled();
    });
});
