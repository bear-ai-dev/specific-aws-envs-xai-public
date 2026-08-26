import { paymentChannel } from '../customer/dto/create-customer.dto.js';
import { InvoiceApproval } from '../setting/dto/InvoiceApproval.js';
import { Invoice, InvoiceLineItem, InvoiceLineItems } from './entities/invoice.entity.js';
import { InvoiceStatus } from './entities/InvoiceStatus.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AccountState } from '../setting/entities/AccountState.js';
import * as taxjarUtil from './taxjar.util.js';

describe('Invoice Entity', () => {
    it('Should prepare Addresses correctly', () => {
        const invoice = new Invoice({ customerId: '123', businessID: 'business', invoiceId: '123' });
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Test Customer',
            email: 'test@meteringco.com',
            address: {
                streetLineOne: '123 Main St',
                streetLineTwo: 'Apt 1',
                countryCode: 'us',
                city: 'New York',
                state: 'NY',
                postalCode: '12345',
            },
            paymentChannel: paymentChannel.manual,
            offering: {
                offeringName: 'Test Offering',
                offeringId: '123',
                dimensions: [],
            },
        });
        invoice.loadPropertiesFromSettingsEntity({
            addressLine1: '123 Main Ave',
            addressLine2: 'Apt 1000',
            city: 'San Francisco',
            state: 'CA',
            country: 'us',
            postalCode: '94105',
        });
        const { fromEntity, toEntity } = invoice.prepareAddressesForInvoice();
        expect(fromEntity).toContain('123 Main Ave');
        expect(fromEntity).toContain('Apt 1000');
        expect(fromEntity).toContain('San Francisco');
        expect(fromEntity).toContain('CA');
        expect(fromEntity).toContain('United States of America');
        expect(fromEntity).toContain('94105');
        expect(toEntity).toContain('123 Main St');
        expect(toEntity).toContain('Apt 1');
        expect(toEntity).toContain('New York');
        expect(toEntity).toContain('NY');
        expect(toEntity).toContain('United States of America');
        expect(toEntity).toContain('12345');
        expect(toEntity).toContain('test@meteringco.com');
    });
    it('should move the invoice to open status if settings are set correctly', async () => {
        const invoice = new Invoice({ customerId: '123', businessID: 'business', invoiceId: '123' });
        invoice.saveToDB = jest.fn();

        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Test Customer',
            email: 'test@meteringco.com',
            address: {
                streetLineOne: '123 Main St',
                streetLineTwo: 'Apt 1',
                countryCode: 'us',
                city: 'New York',
                state: 'NY',
                postalCode: '12345',
            },
            paymentChannel: paymentChannel.manual,
            offering: {
                offeringName: 'Test Offering',
                offeringId: '123',
                dimensions: [],
            },
        });
        invoice.loadPropertiesFromSettingsEntity({ invoiceApproval: InvoiceApproval.automatic });
        await invoice.generate(false);
        expect(invoice.invoiceStatus).toBe(InvoiceStatus.OPEN);
        expect(invoice.saveToDB).toBeCalledTimes(2);
    });
    test.each([
        [[{ quantity: 10, unitCost: 0.0000000001, name: 'low price under 0.00' }], 0],
        [[{ quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' }], 0.01],
        [
            [
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
            ],
            0.02,
        ],
        [
            [
                { quantity: 100000000, unitCost: 0.00000123456, name: 'higher total odd unitcost' },
                { quantity: 100000000, unitCost: 0.0000099999, name: 'higher total' },
            ],
            1123.45,
        ],
        [
            [
                { quantity: 1, unitCost: 123.888899874, name: 'low quantity, pricecise unitCost' },
                { quantity: 2, unitCost: 10, name: 'integer quantity and unitCost' },
            ],
            143.89,
        ],
        [
            [
                { quantity: 0, unitCost: 123.888899874, name: '0 quantity' },
                { quantity: 2, unitCost: 10, name: 'integer quantity and unitCost' },
            ],
            20,
        ],
        [
            [
                { quantity: 1000000, unitCost: 0.000016, name: 'realistic example' },
                { quantity: 1, unitCost: 20, name: 'subscription fee' },
            ],
            36,
        ],
        [
            [
                { quantity: 1000000, unitCost: 0.000016, name: 'realistic example' },
                { quantity: 1, unitCost: 20, name: 'subscription fee' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
                { quantity: 100000000, unitCost: 0.0000000001, name: 'higher quantity over 0.01' },
            ],
            36.12,
        ],
    ])('High Precision calculations', (inputArray, expected) => {
        const invoiceLineItems = new InvoiceLineItems();
        inputArray.forEach(({ quantity, unitCost, name }) =>
            invoiceLineItems.addLineItem(new InvoiceLineItem(name, quantity, unitCost)),
        );

        const invoice = new Invoice({
            customerId: '123',
            businessID: 'business',
            invoiceId: '123',
            invoiceLineItems: invoiceLineItems,
        });
        expect(invoice.totalAmountWithoutTax).toEqual(expected);
    });

    it('should include VAT registrations for European parties', () => {
        const invoice = new Invoice({ customerId: '123', businessID: 'business', invoiceId: '123' });
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Dunmore Trading',
            email: 'accounts@dunmore.example',
            customerVatId: 'IE 6388047V',
            address: {
                streetLineOne: "25 Sir John Rogerson's Quay",
                streetLineTwo: '',
                countryCode: 'ie',
                city: 'Dublin',
                state: 'Leinster',
                postalCode: 'D02 X285',
            },
            paymentChannel: paymentChannel.manual,
            offering: { offeringName: 'Test Offering', offeringId: '123', dimensions: [] },
        });
        invoice.loadPropertiesFromSettingsEntity({
            businessName: 'Harbourgate Systems GmbH',
            addressLine1: 'Rosenthaler Strasse 40',
            addressLine2: '',
            city: 'Berlin',
            state: '',
            country: 'de',
            postalCode: '10178',
            vatId: 'DE 129 273 060',
        });
        const { fromEntity, toEntity } = invoice.prepareAddressesForInvoice();
        expect(fromEntity).toContain('VAT Registration Number: DE 129 273 060');
        expect(toEntity).toContain('VAT Registration Number: IE 6388047V');
    });

    it('should not tax exempt customers', async () => {
        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Platform subscription', 1, 1250));
        const invoice = new Invoice({
            customerId: '123',
            businessID: 'business',
            invoiceId: '123',
            invoiceLineItems: items,
        });
        invoice.saveToDB = jest.fn();
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Larkspur',
            email: 'finance@larkspur.example',
            taxExempt: TaxExempt.exempt,
            address: {
                streetLineOne: '80 Pine Street',
                countryCode: 'us',
                city: 'New York',
                state: 'ny',
                postalCode: '10018',
            },
            paymentChannel: paymentChannel.manual,
            offering: { offeringName: 'Test Offering', offeringId: '123', dimensions: [] },
        });
        invoice.loadPropertiesFromSettingsEntity({
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
            taxJarApiKey: 'tjk_sbx_northwind_a41f',
            taxRate: '0.06',
        });
        await invoice.generate(false);
        expect(invoice.salesTaxRate).toBe(0);
        expect(invoice.taxAmount).toBe(0);
        expect(invoice.total).toBe(1250);
    });

    it('should apply a manual tax rate', async () => {
        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Platform subscription', 1, 1250));
        items.addLineItem(new InvoiceLineItem('API calls (millions)', 12, 18.75));
        const invoice = new Invoice({
            customerId: '123',
            businessID: 'business',
            invoiceId: '123',
            invoiceLineItems: items,
        });
        invoice.saveToDB = jest.fn();
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Dunmore',
            email: 'accounts@dunmore.example',
            taxExempt: TaxExempt.none,
            address: {
                streetLineOne: "25 Sir John Rogerson's Quay",
                countryCode: 'ie',
                city: 'Dublin',
                state: 'Leinster',
                postalCode: 'D02 X285',
            },
            paymentChannel: paymentChannel.manual,
            offering: { offeringName: 'Test Offering', offeringId: '123', dimensions: [] },
        });
        invoice.loadPropertiesFromSettingsEntity({
            taxCalculationType: TaxCalculationType.manual,
            taxRate: '0.19',
        });
        await invoice.generate(true);
        expect(invoice.totalAmountWithoutTax).toBe(1475);
        expect(invoice.salesTaxRate).toBe(0.19);
        expect(invoice.taxAmount).toBe(280.25);
        expect(invoice.total).toBe(1755.25);
    });

    it('should collect nothing when tax calculation is disabled', async () => {
        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Ingest volume (GB)', 340, 0.85));
        const invoice = new Invoice({
            customerId: '123',
            businessID: 'business',
            invoiceId: '123',
            invoiceLineItems: items,
        });
        invoice.saveToDB = jest.fn();
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Ashgrove',
            email: 'ap@ashgrove.example',
            taxExempt: TaxExempt.none,
            address: {
                streetLineOne: '1200 5th Avenue',
                countryCode: 'us',
                city: 'Seattle',
                state: 'wa',
                postalCode: '98104',
            },
            paymentChannel: paymentChannel.manual,
            offering: { offeringName: 'Test Offering', offeringId: '123', dimensions: [] },
        });
        invoice.loadPropertiesFromSettingsEntity({
            taxCalculationType: TaxCalculationType.none,
            taxRate: '0.07',
        });
        await invoice.generate(true);
        expect(invoice.salesTaxRate).toBe(0);
        expect(invoice.taxAmount).toBe(0);
    });

    it('should price destination tax via the authority and keep the invoice rate', async () => {
        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Engineer seats', 18, 65));
        items.addLineItem(new InvoiceLineItem('Support retainer', 1, 192.5));
        const invoice = new Invoice({
            customerId: '123',
            businessID: 'biz_lumen',
            invoiceId: 'inv-1',
            invoiceLineItems: items,
        });
        invoice.saveToDB = jest.fn();
        const taxSpy = jest.spyOn(taxjarUtil, 'taxForOrder').mockResolvedValue({
            rate: 0.04125,
            amount_to_collect: 56.2,
        });
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'biz_lumen',
            customerName: 'Ironvale Systems',
            email: 'ap@ironvale.example',
            taxExempt: TaxExempt.none,
            address: {
                streetLineOne: '301 Congress Avenue',
                countryCode: 'us',
                city: 'Austin',
                state: 'tx',
                postalCode: '78701',
            },
            paymentChannel: paymentChannel.manual,
            offering: { offeringName: 'Test Offering', offeringId: '123', dimensions: [] },
        });
        invoice.loadPropertiesFromSettingsEntity({
            addressLine1: '12 Finsbury Square',
            city: 'London',
            country: 'gb',
            postalCode: 'EC2A 1AS',
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
            taxJarApiKey: 'tjk_prd_lumen_7c30',
            taxCategory: '40030',
            accountState: AccountState.production,
        });
        await invoice.generate(true);
        expect(taxSpy).toHaveBeenCalledWith(
            'tjk_prd_lumen_7c30',
            AccountState.production,
            expect.objectContaining({
                from_country: 'gb',
                from_zip: 'EC2A 1AS',
                to_country: 'us',
                to_zip: '78701',
                to_state: 'tx',
                to_street: '301 Congress Avenue',
                shipping: 0,
                line_items: [
                    { quantity: 18, unit_price: 65, product_tax_code: '40030' },
                    { quantity: 1, unit_price: 192.5, product_tax_code: '40030' },
                ],
            }),
        );
        expect(invoice.salesTaxRate).toBe(0.04125);
        expect(invoice.taxAmount).toBe(56.203125);
        taxSpy.mockRestore();
    });

    it('should report a refused address without stopping the invoice', async () => {
        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Platform subscription', 1, 1250));
        const invoice = new Invoice({
            customerId: '123',
            businessID: 'business',
            invoiceId: '123',
            invoiceLineItems: items,
        });
        invoice.saveToDB = jest.fn();
        const taxSpy = jest.spyOn(taxjarUtil, 'taxForOrder').mockRejectedValue(new Error('to_zip is not a valid postal code for to_state'));
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Seaford',
            email: 'ar@seaford.example',
            taxExempt: TaxExempt.none,
            address: {
                streetLineOne: '77 Water Street',
                countryCode: 'us',
                city: 'New York',
                state: 'ny',
                postalCode: '33101',
            },
            paymentChannel: paymentChannel.manual,
            offering: { offeringName: 'Test Offering', offeringId: '123', dimensions: [] },
        });
        invoice.loadPropertiesFromSettingsEntity({
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
            taxJarApiKey: 'tjk_sbx_northwind_a41f',
            taxCategory: '31000',
        });
        const res = await invoice.generate(true);
        expect(res.message).toEqual('WARNING Errors occured while generating invoice, invoice still generated');
        expect(invoice.salesTaxRate).toBe(0);
        expect(invoice.taxAmount).toBe(0);
        expect(invoice.invoiceId).toBe('123');
        taxSpy.mockRestore();
    });

    it('should reject destination tax when the TaxJar key is missing', async () => {
        const invoice = new Invoice({ customerId: '123', businessID: 'business', invoiceId: '123' });
        invoice.saveToDB = jest.fn();
        invoice.loadPropertiesFromSettingsEntity({
            taxCalculationType: TaxCalculationType.meteringcoCalculated,
            taxJarApiKey: '',
        });
        await expect(invoice.generate(true)).rejects.toThrow('TaxJar API Key is not set');
        expect(invoice.saveToDB).not.toHaveBeenCalled();
    });

    it('should file a settled sale back to the authority under the invoice number', async () => {
        const items = new InvoiceLineItems();
        items.addLineItem(new InvoiceLineItem('Platform subscription', 1, 1250));
        items.addLineItem(new InvoiceLineItem('API calls (millions)', 12, 18.75));
        const invoice = new Invoice({
            customerId: 'cus_hartwell',
            businessID: 'biz_northwind',
            invoiceId: 'e8baf17d-b259-5107-b42b-9e06e2a81545',
            invoiceLineItems: items,
            invoiceStatus: InvoiceStatus.OPEN,
        });
        invoice.saveToDB = jest.fn();
        const fileSpy = jest.spyOn(taxjarUtil, 'createTaxJarOrder').mockResolvedValue();
        invoice.loadPropertiesFromCustomerEntity({
            customerId: 'cus_hartwell',
            businessID: 'biz_northwind',
            customerName: 'Hartwell Media',
            email: 'ap@hartwell.example',
            address: {
                streetLineOne: '412 West 38th Street',
                streetLineTwo: 'Floor 6',
                countryCode: 'us',
                city: 'New York',
                state: 'ny',
                postalCode: '10018',
            },
            paymentChannel: paymentChannel.Stripe,
            offering: { offeringName: 'Test Offering', offeringId: '123', dimensions: [] },
        });
        invoice.loadPropertiesFromSettingsEntity({
            taxJarApiKey: 'tjk_sbx_northwind_a41f',
            accountState: AccountState.sandbox,
        });
        invoice.salesTaxRate = 0.06;
        invoice.taxAmount = 88.5;
        await invoice.updateStatus(InvoiceStatus.PAID);
        expect(fileSpy).toHaveBeenCalledWith(
            'tjk_sbx_northwind_a41f',
            AccountState.sandbox,
            expect.objectContaining({
                provider: 'meteringco',
                to_country: 'us',
                to_zip: '10018',
                to_state: 'ny',
                to_city: 'New York',
                to_street: '412 West 38th Street Floor 6',
                amount: 1475,
                shipping: 0.0,
                sales_tax: 88.5,
                transaction_id: 'e8baf17d-b259-5107-b42b-9e06e2a81545',
            }),
        );
        fileSpy.mockRestore();
    });

});
