import { BadRequestException } from '@nestjs/common';
import { TaxService } from './tax.service.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { InvoiceLineItem, InvoiceLineItems } from '../invoice/entities/invoice.entity.js';
import { AuditService } from '../audit/audit.service.js';

const taxForOrder = jest.fn();
const createOrder = jest.fn();
const categories = jest.fn();

jest.mock('taxjar', () => {
    return jest.fn().mockImplementation((config) => ({
        config,
        taxForOrder,
        createOrder,
        categories,
    }));
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Taxjar = require('taxjar');

describe('TaxService', () => {
    const lineItems = new InvoiceLineItems();
    lineItems.addLineItem(new InvoiceLineItem('API Calls', 10, 0.4));

    const destinationDocument = {
        invoiceId: 'inv-1',
        invoiceDate: new Date('2024-01-01T00:00:00.000Z'),
        totalAmountWithoutTax: 4,
        invoiceLineItems: lineItems,
        taxCalculationType: TaxCalculationType.meteringcoCalculated,
        taxCategory: '31000',
        taxJarApiKey: 'sandbox-key',
        accountState: AccountState.sandbox,
        taxExempt: TaxExempt.none,
        fromStreetLine1: '1 Downing Street',
        fromCity: 'London',
        fromState: 'London',
        fromPostalCode: 'W1J 8AJ',
        fromCountry: 'uk',
        toStreetLine1: '259 Fayette St',
        toCity: 'Palmyra',
        toState: 'NY',
        toPostalCode: '14522',
        toCountry: 'us',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/sandbox';
        process.env.PROD_TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/production';
        jest.spyOn(AuditService, 'publishEvent').mockImplementation(() => undefined as never);
    });

    it('charges nothing when the customer is exempt', async () => {
        const result = await TaxService.calculateForInvoice({
            ...destinationDocument,
            taxExempt: TaxExempt.exempt,
            taxCalculationType: TaxCalculationType.manual,
            taxRate: '20',
        });
        expect(result).toEqual({ rate: 0, amount: 0 });
        expect(taxForOrder).not.toHaveBeenCalled();
    });

    it('charges nothing when the business collects no tax', async () => {
        const result = await TaxService.calculateForInvoice({
            ...destinationDocument,
            taxCalculationType: TaxCalculationType.none,
        });
        expect(result).toEqual({ rate: 0, amount: 0 });
    });

    it('applies a business-maintained rate', async () => {
        const result = await TaxService.calculateForInvoice({
            ...destinationDocument,
            taxCalculationType: TaxCalculationType.manual,
            taxRate: '8',
        });
        expect(result).toEqual({ rate: 0.08, amount: 0.32 });
    });

    it('prices a destination against the sandbox authority', async () => {
        taxForOrder.mockResolvedValueOnce({
            tax: { rate: 0.08, amount_to_collect: 0.32 },
        });
        const result = await TaxService.calculateForInvoice(destinationDocument);
        expect(Taxjar).toHaveBeenCalledWith({
            apiKey: 'sandbox-key',
            apiUrl: 'http://127.0.0.1:4566/taxjar/sandbox',
        });
        expect(taxForOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                from_country: 'GB',
                from_zip: 'W1J 8AJ',
                from_street: '1 Downing Street',
                to_country: 'US',
                to_zip: '14522',
                to_state: 'NY',
                to_city: 'Palmyra',
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
        expect(result).toEqual({ rate: 0.08, amount: 0.32 });
    });

    it('uses the production authority for production accounts', async () => {
        taxForOrder.mockResolvedValueOnce({
            tax: { rate: 0.1, amount_to_collect: 0.4 },
        });
        await TaxService.calculateForInvoice({
            ...destinationDocument,
            accountState: AccountState.production,
            taxJarApiKey: 'prod-key',
        });
        expect(Taxjar).toHaveBeenCalledWith({
            apiKey: 'prod-key',
            apiUrl: 'http://127.0.0.1:4566/taxjar/production',
        });
    });

    it('reports a refused address without throwing', async () => {
        taxForOrder.mockRejectedValueOnce({ error: 'Bad Request', detail: 'to_zip is not a valid postal code' });
        const result = await TaxService.calculateForInvoice(destinationDocument);
        expect(result).toEqual({ rate: 0, amount: 0 });
        expect(AuditService.publishEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('TaxJar'),
            }),
        );
    });

    it('files a settled sale under the invoice number', async () => {
        createOrder.mockResolvedValueOnce({ order: { transaction_id: 'inv-1' } });
        await TaxService.fileSale({
            ...destinationDocument,
            taxAmount: 0.32,
        });
        expect(createOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                transaction_id: 'inv-1',
                amount: 4,
                sales_tax: 0.32,
                shipping: 0,
                to_country: 'US',
                from_country: 'GB',
            }),
        );
    });

    it('does not file a sale for businesses that do not use the authority', async () => {
        await TaxService.fileSale({
            ...destinationDocument,
            taxCalculationType: TaxCalculationType.manual,
            taxAmount: 0.32,
        });
        expect(createOrder).not.toHaveBeenCalled();
    });

    it('rejects an invalid TaxJar key', async () => {
        categories.mockRejectedValueOnce(new Error('Unauthorized'));
        await expect(TaxService.validateApiKey('wow a fake key!')).rejects.toBeInstanceOf(BadRequestException);
    });
});
