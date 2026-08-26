import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { AuditService } from '../audit/audit.service.js';
import Taxjar from 'taxjar';
import {
    calculateTax,
    createTaxJarClient,
    fileSaleWithTaxAuthority,
    isEuropeanTransaction,
    normalizeCountryCode,
    parseManualTaxRate,
} from './tax.js';

jest.mock('../audit/audit.service.js', () => ({
    AuditService: { publishEvent: jest.fn() },
}));

const taxForOrder = jest.fn();
const createOrder = jest.fn();
const updateOrder = jest.fn();
const categories = jest.fn();

jest.mock('taxjar', () => {
    return jest.fn().mockImplementation(() => ({
        taxForOrder,
        createOrder,
        updateOrder,
        categories,
    }));
});

describe('Tax calculator', () => {
    const baseInput = {
        from: {
            streetLine1: '1 Downing Street',
            city: 'London',
            state: 'London',
            postalCode: 'W1J 8AJ',
            country: 'gb',
        },
        to: {
            streetLine1: '259 Fayette St',
            city: 'Palmyra',
            state: 'NY',
            postalCode: '14522',
            country: 'us',
        },
        lineItems: [{ name: 'Request - Simple Offering', quantity: 10, unitCost: 0.4 }],
        amount: 4,
        invoiceId: 'inv-1',
        invoiceDate: new Date('2024-01-01T00:00:00.000Z'),
        taxJarApiKey: 'sandbox-key',
        taxCategory: '31000',
        accountState: AccountState.sandbox,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/sandbox';
        process.env.PROD_TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/production';
    });

    it('normalizes country codes and detects European parties', () => {
        expect(normalizeCountryCode('usa')).toEqual('US');
        expect(normalizeCountryCode('uk')).toEqual('GB');
        expect(normalizeCountryCode('de')).toEqual('DE');
        expect(isEuropeanTransaction('gb', 'de')).toBe(true);
        expect(isEuropeanTransaction('us', 'de')).toBe(false);
    });

    it('parses manual rates expressed as percentages or decimals', () => {
        expect(parseManualTaxRate('8')).toEqual(0.08);
        expect(parseManualTaxRate('0.08')).toEqual(0.08);
        expect(parseManualTaxRate('0')).toEqual(0);
    });

    it('charges nothing when the customer is exempt, even if the business uses destination tax', async () => {
        const result = await calculateTax({
            ...baseInput,
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
            taxExempt: TaxExempt.exempt,
        });
        expect(result).toEqual({ salesTaxRate: 0, taxAmount: 0 });
        expect(taxForOrder).not.toHaveBeenCalled();
    });

    it('charges nothing when the business collects no tax', async () => {
        const result = await calculateTax({
            ...baseInput,
            taxCalculationType: TaxCalculationType.none,
        });
        expect(result).toEqual({ salesTaxRate: 0, taxAmount: 0 });
    });

    it('applies a business-maintained rate', async () => {
        const result = await calculateTax({
            ...baseInput,
            taxCalculationType: TaxCalculationType.manual,
            taxRate: '8',
        });
        expect(result).toEqual({ salesTaxRate: 0.08, taxAmount: 0.32 });
        expect(taxForOrder).not.toHaveBeenCalled();
    });

    it('prices destination tax against the authority with both addresses, lines and category', async () => {
        taxForOrder.mockResolvedValueOnce({ tax: { rate: 0.08, amount_to_collect: 0.32 } });
        const result = await calculateTax({
            ...baseInput,
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
        });
        expect(result).toEqual({ salesTaxRate: 0.08, taxAmount: 0.32 });
        expect(taxForOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                from_country: 'GB',
                from_zip: 'W1J 8AJ',
                from_street: '1 Downing Street',
                to_country: 'US',
                to_zip: '14522',
                to_street: '259 Fayette St',
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
        expect(Taxjar).toHaveBeenCalledWith({
            apiKey: 'sandbox-key',
            apiUrl: 'http://127.0.0.1:4566/taxjar/sandbox',
        });
    });

    it('uses the production authority for production accounts', () => {
        createTaxJarClient('prod-key', AccountState.production);
        expect(Taxjar).toHaveBeenCalledWith({
            apiKey: 'prod-key',
            apiUrl: 'http://127.0.0.1:4566/taxjar/production',
        });
    });

    it('reports a refused address without stopping the invoice', async () => {
        taxForOrder.mockRejectedValueOnce(new Error('to_zip is not used within to_state'));
        const result = await calculateTax({
            ...baseInput,
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
        });
        expect(result).toEqual({ salesTaxRate: 0, taxAmount: 0 });
        expect(AuditService.publishEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('TaxJar refused an address'),
            }),
        );
    });

    it('files a settled sale under the invoice number', async () => {
        createOrder.mockResolvedValueOnce({});
        await fileSaleWithTaxAuthority({
            ...baseInput,
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
            salesTax: 0.32,
        });
        expect(createOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                transaction_id: 'inv-1',
                amount: 4,
                sales_tax: 0.32,
            }),
        );
    });
});
