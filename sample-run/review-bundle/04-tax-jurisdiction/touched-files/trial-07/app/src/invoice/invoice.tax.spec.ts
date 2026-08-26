import { BadRequestException } from '@nestjs/common';
import { Invoice, InvoiceLineItem, InvoiceLineItems } from './entities/invoice.entity.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { paymentChannel } from '../customer/dto/create-customer.dto.js';
import * as taxJarClient from '../utils/taxjarClient.js';

describe('Invoice tax calculation', () => {
    const lineItems = () => {
        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Platform subscription', 1, 1250));
        items.addLineItem(new InvoiceLineItem('API calls (millions)', 12, 18.75));
        return items;
    };

    const baseInvoice = () =>
        new Invoice({
            customerId: 'cus_1',
            businessID: 'biz_1',
            invoiceId: 'inv_1',
            invoiceLineItems: lineItems(),
        });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('applies a business-maintained rate', async () => {
        const invoice = baseInvoice();
        invoice.taxCalculationType = TaxCalculationType.manual;
        invoice.taxRate = '0.19';
        invoice.taxExempt = TaxExempt.none;
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toEqual(0.19);
        expect(invoice.taxAmount).toEqual(280.25);
        expect(invoice.total).toEqual(1755.25);
    });

    it('charges nothing when the customer is exempt', async () => {
        const invoice = baseInvoice();
        invoice.taxCalculationType = TaxCalculationType.manual;
        invoice.taxRate = '0.19';
        invoice.taxExempt = TaxExempt.exempt;
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toEqual(0);
        expect(invoice.taxAmount).toEqual(0);
        expect(invoice.total).toEqual(1475);
    });

    it('charges nothing when the business collects no tax', async () => {
        const invoice = baseInvoice();
        invoice.taxCalculationType = TaxCalculationType.none;
        invoice.taxRate = '0.07';
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toEqual(0);
        expect(invoice.taxAmount).toEqual(0);
    });

    it('prices destination tax via TaxJar and keeps the quoted rate', async () => {
        const taxForOrder = jest.fn().mockResolvedValue({
            tax: { rate: 0.04125, amount_to_collect: 56.2 },
        });
        jest.spyOn(taxJarClient, 'createTaxJarClient').mockReturnValue({ taxForOrder } as any);

        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Engineer seats', 18, 65));
        items.addLineItem(new InvoiceLineItem('Support retainer', 1, 192.5));
        const invoice = new Invoice({
            customerId: 'cus_1',
            businessID: 'biz_1',
            invoiceId: 'inv_1',
            invoiceLineItems: items,
        });
        invoice.taxCalculationType = TaxCalculationType.meteringcoCalculated;
        invoice.taxJarApiKey = 'tjk_prd_lumen_7c30';
        invoice.accountState = AccountState.production;
        invoice.taxCategory = '40030';
        invoice.fromCountry = 'gb';
        invoice.fromPostalCode = 'EC2A 1AS';
        invoice.fromState = '';
        invoice.fromCity = 'London';
        invoice.fromStreetLine1 = '12 Finsbury Square';
        invoice.toCountry = 'us';
        invoice.toPostalCode = '78701';
        invoice.toState = 'tx';
        invoice.toCity = 'Austin';
        invoice.toStreetLine1 = '301 Congress Avenue';
        invoice.taxExempt = TaxExempt.none;

        await invoice.applyTax();

        expect(taxJarClient.createTaxJarClient).toHaveBeenCalledWith('tjk_prd_lumen_7c30', AccountState.production);
        expect(taxForOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                from_country: 'gb',
                from_zip: 'EC2A 1AS',
                to_country: 'us',
                to_zip: '78701',
                to_state: 'tx',
                to_street: '301 Congress Avenue',
                shipping: 0,
                line_items: [
                    { quantity: 18, product_tax_code: '40030', unit_price: 65 },
                    { quantity: 1, product_tax_code: '40030', unit_price: 192.5 },
                ],
            }),
        );
        expect(invoice.salesTaxRate).toEqual(0.04125);
        expect(invoice.taxAmount).toEqual(56.203125);
    });

    it('reports a refused address without stopping the invoice', async () => {
        jest.spyOn(taxJarClient, 'createTaxJarClient').mockReturnValue({
            taxForOrder: jest.fn().mockRejectedValue(new Error('to_zip is not a valid postal code for to_state')),
        } as any);

        const invoice = baseInvoice();
        invoice.taxCalculationType = TaxCalculationType.meteringcoCalculated;
        invoice.taxJarApiKey = 'tjk_sbx_northwind_a41f';
        invoice.accountState = AccountState.sandbox;

        await invoice.applyTax();
        expect(invoice.salesTaxRate).toEqual(0);
        expect(invoice.taxAmount).toEqual(0);
        expect(invoice.warning).toEqual(taxJarClient.INVOICE_TAX_WARNING);
    });

    it('rejects destination pricing when no TaxJar key is configured', async () => {
        const invoice = baseInvoice();
        invoice.taxCalculationType = TaxCalculationType.meteringcoCalculated;
        invoice.taxJarApiKey = '';
        await expect(invoice.applyTax()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('shows VAT registrations on European invoices', () => {
        const invoice = baseInvoice();
        invoice.loadPropertiesFromSettingsEntity({
            businessName: 'Harbourgate Systems GmbH',
            addressLine1: 'Rosenthaler Strasse 40',
            addressLine2: '',
            city: 'Berlin',
            state: '',
            country: 'de',
            postalCode: '10178',
            vatId: 'DE 129 273 060',
        } as any);
        invoice.loadPropertiesFromCustomerEntity({
            customerId: 'cus_dunmore',
            customerName: 'Dunmore Trading',
            email: 'accounts@dunmore.example',
            address: {
                streetLineOne: "25 Sir John Rogerson's Quay",
                streetLineTwo: '',
                city: 'Dublin',
                state: 'Leinster',
                postalCode: 'D02 X285',
                countryCode: 'ie',
            },
            paymentChannel: paymentChannel.manual,
            customerVatId: 'IE 6388047V',
        } as any);

        const { fromEntity, toEntity } = invoice.prepareAddressesForInvoice();
        expect(fromEntity).toContain('VAT Registration Number: DE 129 273 060');
        expect(toEntity).toContain('VAT Registration Number: IE 6388047V');
    });
});
