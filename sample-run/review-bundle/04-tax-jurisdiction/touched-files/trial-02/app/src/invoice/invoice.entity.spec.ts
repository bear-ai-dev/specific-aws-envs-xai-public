import { paymentChannel } from '../customer/dto/create-customer.dto.js';
import { InvoiceApproval } from '../setting/dto/InvoiceApproval.js';
import { Invoice, InvoiceLineItem, InvoiceLineItems } from './entities/invoice.entity.js';
import { InvoiceStatus } from './entities/InvoiceStatus.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { TaxService } from '../tax/tax.service.js';

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

    it('Should include both VAT registrations for European parties', () => {
        const invoice = new Invoice({ customerId: '123', businessID: 'business', invoiceId: '123' });
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Berlin Buyer',
            email: 'buyer@example.de',
            customerVatId: 'DE123456789',
            address: {
                streetLineOne: 'Unter den Linden 1',
                streetLineTwo: '',
                countryCode: 'de',
                city: 'Berlin',
                state: 'BE',
                postalCode: '10117',
            },
            paymentChannel: paymentChannel.manual,
            offering: {
                offeringName: 'Test Offering',
                offeringId: '123',
                dimensions: [],
            },
        });
        invoice.loadPropertiesFromSettingsEntity({
            businessName: 'Paris Seller',
            addressLine1: '10 Rue de Rivoli',
            addressLine2: '',
            city: 'Paris',
            state: 'IDF',
            country: 'fr',
            postalCode: '75001',
            vatId: 'FR123456789',
        });
        const { fromEntity, toEntity } = invoice.prepareAddressesForInvoice();
        expect(fromEntity).toContain('VAT FR123456789');
        expect(toEntity).toContain('VAT DE123456789');
    });

    it('Should not include VAT registrations when a party is outside Europe', () => {
        const invoice = new Invoice({ customerId: '123', businessID: 'business', invoiceId: '123' });
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'NY Buyer',
            email: 'buyer@example.com',
            customerVatId: 'US-NONE',
            address: {
                streetLineOne: '1 Wall St',
                streetLineTwo: '',
                countryCode: 'us',
                city: 'New York',
                state: 'NY',
                postalCode: '10005',
            },
            paymentChannel: paymentChannel.manual,
            offering: {
                offeringName: 'Test Offering',
                offeringId: '123',
                dimensions: [],
            },
        });
        invoice.loadPropertiesFromSettingsEntity({
            businessName: 'Paris Seller',
            addressLine1: '10 Rue de Rivoli',
            addressLine2: '',
            city: 'Paris',
            state: 'IDF',
            country: 'fr',
            postalCode: '75001',
            vatId: 'FR123456789',
        });
        const { fromEntity, toEntity } = invoice.prepareAddressesForInvoice();
        expect(fromEntity).not.toContain('VAT FR123456789');
        expect(toEntity).not.toContain('VAT US-NONE');
    });

    it('Should apply a maintained tax rate when generating an invoice', async () => {
        const invoiceLineItems = new InvoiceLineItems();
        invoiceLineItems.addLineItem(new InvoiceLineItem('API Calls', 10, 0.4));
        const invoice = new Invoice({
            customerId: '123',
            businessID: 'business',
            invoiceId: 'taxed',
            invoiceLineItems,
        });
        invoice.saveToDB = jest.fn();
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Test Customer',
            email: 'test@meteringco.com',
            taxExempt: TaxExempt.none,
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
            invoiceApproval: InvoiceApproval.manual,
            taxCalculationType: TaxCalculationType.manual,
            taxRate: '8',
        });
        await invoice.generate(true);
        expect(invoice.salesTaxRate).toEqual(0.08);
        expect(invoice.taxAmount).toEqual(0.32);
        expect(invoice.total).toEqual(4.32);
    });

    it('Should charge nothing for an exempt customer even when the business has a rate', async () => {
        const invoiceLineItems = new InvoiceLineItems();
        invoiceLineItems.addLineItem(new InvoiceLineItem('API Calls', 10, 0.4));
        const invoice = new Invoice({
            customerId: '123',
            businessID: 'business',
            invoiceId: 'exempt',
            invoiceLineItems,
        });
        invoice.saveToDB = jest.fn();
        invoice.loadPropertiesFromCustomerEntity({
            customerId: '123',
            businessID: 'business',
            customerName: 'Exempt Customer',
            email: 'exempt@meteringco.com',
            taxExempt: TaxExempt.exempt,
            address: {
                streetLineOne: '123 Main St',
                streetLineTwo: '',
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
            invoiceApproval: InvoiceApproval.manual,
            taxCalculationType: TaxCalculationType.manual,
            taxRate: '20',
        });
        await invoice.generate(true);
        expect(invoice.salesTaxRate).toEqual(0);
        expect(invoice.taxAmount).toEqual(0);
        expect(invoice.total).toEqual(4);
    });

    it('Should file a sale after the invoice is settled', async () => {
        const invoice = new Invoice({ customerId: '123', businessID: 'business', invoiceId: 'paid-1' });
        invoice.saveToDB = jest.fn();
        const fileSale = jest.spyOn(TaxService, 'fileSale').mockResolvedValueOnce();
        invoice.invoiceStatus = InvoiceStatus.OPEN;
        await invoice.updateStatus(InvoiceStatus.PAID);
        expect(fileSale).toHaveBeenCalledWith(invoice);
        fileSale.mockRestore();
    });
});
