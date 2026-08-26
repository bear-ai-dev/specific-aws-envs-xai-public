import { paymentChannel } from '../customer/dto/create-customer.dto.js';
import { InvoiceApproval } from '../setting/dto/InvoiceApproval.js';
import { Invoice, InvoiceLineItem, InvoiceLineItems } from './entities/invoice.entity.js';
import { InvoiceStatus } from './entities/InvoiceStatus.js';

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

    describe('tax calculation', () => {
        const lineItems = new InvoiceLineItems();
        lineItems.addLineItem(new InvoiceLineItem('Platform subscription', 1, 1250));
        lineItems.addLineItem(new InvoiceLineItem('API calls (millions)', 12, 18.75));

        const loadUsParties = (invoice: Invoice) => {
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
                paymentChannel: paymentChannel.manual,
            });
            invoice.loadPropertiesFromSettingsEntity({
                addressLine1: '1209 Orange Street',
                addressLine2: 'Suite 400',
                city: 'Wilmington',
                state: 'de',
                country: 'us',
                postalCode: '19801',
                businessName: 'Northwind Analytics',
                vatId: 'US-EIN-51-0793344',
            });
        };

        it('applies a business-maintained rate', async () => {
            const invoice = new Invoice({
                customerId: 'cus',
                businessID: 'biz',
                invoiceId: 'inv-manual',
                invoiceLineItems: lineItems,
            });
            invoice.saveToDB = jest.fn();
            invoice.loadPropertiesFromCustomerEntity({
                customerId: 'cus',
                businessID: 'biz',
                customerName: 'Dunmore Trading',
                email: 'accounts@dunmore.example',
                customerVatId: 'IE 6388047V',
                address: {
                    streetLineOne: "25 Sir John Rogerson's Quay",
                    countryCode: 'ie',
                    city: 'Dublin',
                    state: 'Leinster',
                    postalCode: 'D02 X285',
                },
                paymentChannel: paymentChannel.manual,
            });
            invoice.loadPropertiesFromSettingsEntity({
                addressLine1: 'Rosenthaler Strasse 40',
                city: 'Berlin',
                country: 'de',
                postalCode: '10178',
                businessName: 'Harbourgate Systems GmbH',
                vatId: 'DE 129 273 060',
                taxCalculationType: 'manual' as any,
                taxRate: '0.19',
            });
            await invoice.generate(true);
            expect(invoice.salesTaxRate).toBe(0.19);
            expect(invoice.taxAmount).toBe(280.25);
            expect(invoice.total).toBe(1755.25);
            expect(invoice.fromEntity).toContain('VAT Registration Number: DE 129 273 060');
            expect(invoice.toEntity).toContain('VAT Registration Number: IE 6388047V');
        });

        it('charges nothing when the customer is exempt', async () => {
            const invoice = new Invoice({
                customerId: 'cus',
                businessID: 'biz',
                invoiceId: 'inv-exempt',
                invoiceLineItems: lineItems,
            });
            invoice.saveToDB = jest.fn();
            loadUsParties(invoice);
            invoice.taxExempt = 'exempt' as any;
            invoice.taxCalculationType = 'manual' as any;
            invoice.taxRate = '0.19';
            await invoice.generate(true);
            expect(invoice.salesTaxRate).toBe(0);
            expect(invoice.taxAmount).toBe(0);
            expect(invoice.total).toBe(1475);
        });

        it('prices against the destination via the tax authority', async () => {
            const invoice = new Invoice({
                customerId: 'cus',
                businessID: 'biz',
                invoiceId: 'inv-dest',
                invoiceLineItems: lineItems,
            });
            invoice.saveToDB = jest.fn();
            loadUsParties(invoice);
            invoice.taxCalculationType = 'meteringcoCalculated' as any;
            invoice.taxJarApiKey = 'tjk_sbx_northwind_a41f';
            invoice.taxCategory = '31000';
            const taxForOrder = jest.fn().mockResolvedValue({ rate: 0.06, amountToCollect: 88.5 });
            invoice.createTaxJarClient = jest.fn().mockReturnValue({ taxForOrder, createOrder: jest.fn() });
            await invoice.generate(true);
            expect(taxForOrder).toHaveBeenCalledWith(
                expect.objectContaining({
                    addresses: expect.objectContaining({
                        fromCountry: 'us',
                        fromPostalCode: '19801',
                        fromState: 'de',
                        fromCity: 'Wilmington',
                        fromStreet: '1209 Orange Street',
                        toCountry: 'us',
                        toPostalCode: '10018',
                        toState: 'ny',
                        toCity: 'New York',
                        toStreet: '412 West 38th Street',
                    }),
                    taxCategory: '31000',
                }),
            );
            expect(invoice.salesTaxRate).toBe(0.06);
            expect(invoice.taxAmount).toBe(88.5);
            expect(invoice.total).toBe(1563.5);
        });

        it('reports a refused address without stopping the invoice', async () => {
            const invoice = new Invoice({
                customerId: 'cus',
                businessID: 'biz',
                invoiceId: 'inv-bad-addr',
                invoiceLineItems: lineItems,
            });
            invoice.saveToDB = jest.fn();
            loadUsParties(invoice);
            invoice.taxCalculationType = 'meteringcoCalculated' as any;
            invoice.taxJarApiKey = 'tjk_sbx_northwind_a41f';
            invoice.createTaxJarClient = jest.fn().mockReturnValue({
                taxForOrder: jest.fn().mockRejectedValue(new Error('to_zip is not a valid postal code for to_state')),
                createOrder: jest.fn(),
            });
            const res = await invoice.generate(true);
            expect(res.invoiceId).toBe('inv-bad-addr');
            expect(res.warning).toEqual(expect.stringContaining('WARNING'));
            expect(invoice.taxAmount).toBe(0);
            expect(invoice.saveToDB).toHaveBeenCalled();
        });

        it('files the sale when the invoice is settled', async () => {
            const invoice = new Invoice({
                customerId: 'cus',
                businessID: 'biz',
                invoiceId: 'e8baf17d-b259-5107-b42b-9e06e2a81545',
                invoiceLineItems: lineItems,
                invoiceStatus: InvoiceStatus.OPEN,
            });
            invoice.saveToDB = jest.fn();
            loadUsParties(invoice);
            invoice.taxJarApiKey = 'tjk_sbx_northwind_a41f';
            invoice.taxAmount = 88.5;
            invoice.totalAmountWithoutTax = 1475;
            const createOrder = jest.fn().mockResolvedValue(undefined);
            invoice.createTaxJarClient = jest.fn().mockReturnValue({ taxForOrder: jest.fn(), createOrder });
            await invoice.updateStatus(InvoiceStatus.PAID);
            expect(createOrder).toHaveBeenCalledWith(
                expect.objectContaining({
                    transactionId: 'e8baf17d-b259-5107-b42b-9e06e2a81545',
                    toCountry: 'us',
                    toPostalCode: '10018',
                    toState: 'ny',
                    toCity: 'New York',
                    toStreet: '412 West 38th Street Floor 6',
                    amount: 1475,
                    salesTax: 88.5,
                }),
            );
        });

        it('collects nothing when the business is configured to collect nothing', async () => {
            const invoice = new Invoice({
                customerId: 'cus',
                businessID: 'biz',
                invoiceId: 'inv-none',
                invoiceLineItems: lineItems,
            });
            invoice.saveToDB = jest.fn();
            loadUsParties(invoice);
            invoice.taxCalculationType = '' as any;
            invoice.taxRate = '0.07';
            await invoice.generate(true);
            expect(invoice.salesTaxRate).toBe(0);
            expect(invoice.taxAmount).toBe(0);
        });
    });
});
