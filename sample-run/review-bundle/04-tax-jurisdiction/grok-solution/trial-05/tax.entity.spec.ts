import { Invoice, InvoiceLineItem, InvoiceLineItems } from './entities/invoice.entity.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { paymentChannel } from '../customer/dto/create-customer.dto.js';
import { InvoiceApproval } from '../setting/dto/InvoiceApproval.js';

function lineItems(items: Array<{ name: string; quantity: number; unitCost: number }>): InvoiceLineItems {
    const collection = new InvoiceLineItems();
    items.forEach(({ name, quantity, unitCost }) => collection.addLineItem(new InvoiceLineItem(name, quantity, unitCost)));
    return collection;
}

function buildInvoice({
    settings,
    customer,
    items,
}: {
    settings: Record<string, unknown>;
    customer: Record<string, unknown>;
    items: Array<{ name: string; quantity: number; unitCost: number }>;
}): Invoice {
    const invoice = new Invoice({
        customerId: customer.customerId as string,
        businessID: settings.businessID as string,
        invoiceId: 'inv-test',
        invoiceLineItems: lineItems(items),
    });
    invoice.saveToDB = jest.fn();
    invoice.loadPropertiesFromSettingsEntity({
        invoiceApproval: InvoiceApproval.manual,
        ...settings,
    } as any);
    invoice.loadPropertiesFromCustomerEntity({
        paymentChannel: paymentChannel.manual,
        offering: { offeringName: 'x', offeringId: 'y', dimensions: [] },
        ...customer,
    } as any);
    return invoice;
}

describe('Invoice tax calculation', () => {
    it('uses destination rates from the sandbox authority for meteringcoCalculated', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_northwind',
                businessName: 'Northwind Analytics',
                addressLine1: '1209 Orange Street',
                city: 'Wilmington',
                state: 'de',
                country: 'us',
                postalCode: '19801',
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxCategory: '31000',
                taxJarApiKey: 'tjk_sbx_northwind_a41f',
                accountState: AccountState.sandbox,
            },
            customer: {
                customerId: 'cus_hartwell',
                customerName: 'Hartwell Media',
                email: 'ap@hartwell.example',
                taxExempt: TaxExempt.none,
                address: {
                    streetLineOne: '412 West 38th Street',
                    streetLineTwo: 'Floor 6',
                    city: 'New York',
                    state: 'ny',
                    postalCode: '10018',
                    countryCode: 'us',
                },
            },
            items: [
                { name: 'Platform subscription', quantity: 1, unitCost: 1250 },
                { name: 'API calls (millions)', quantity: 12, unitCost: 18.75 },
            ],
        });
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toBe(0.06);
        expect(invoice.taxAmount).toBe(88.5);
        expect(invoice.total).toBe(1563.5);
    });

    it('charges nothing for an exempt customer even when destination tax is configured', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_northwind',
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxCategory: '31000',
                taxJarApiKey: 'tjk_sbx_northwind_a41f',
                accountState: AccountState.sandbox,
                country: 'us',
                postalCode: '19801',
                state: 'de',
                city: 'Wilmington',
                addressLine1: '1209 Orange Street',
            },
            customer: {
                customerId: 'cus_larkspur',
                customerName: 'Larkspur Foundation',
                email: 'finance@larkspur.example',
                taxExempt: TaxExempt.exempt,
                address: {
                    streetLineOne: '80 Pine Street',
                    city: 'New York',
                    state: 'ny',
                    postalCode: '10018',
                    countryCode: 'us',
                },
            },
            items: [
                { name: 'Engineer seats', quantity: 18, unitCost: 65 },
                { name: 'Support retainer', quantity: 1, unitCost: 192.5 },
            ],
        });
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toBe(0);
        expect(invoice.taxAmount).toBe(0);
    });

    it('keeps generating when the authority refuses an address', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_northwind',
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxCategory: '31000',
                taxJarApiKey: 'tjk_sbx_northwind_a41f',
                accountState: AccountState.sandbox,
                country: 'us',
                postalCode: '19801',
                state: 'de',
                city: 'Wilmington',
                addressLine1: '1209 Orange Street',
            },
            customer: {
                customerId: 'cus_seaford',
                customerName: 'Seaford Logistics',
                email: 'ar@seaford.example',
                taxExempt: TaxExempt.none,
                address: {
                    streetLineOne: '77 Water Street',
                    city: 'New York',
                    state: 'ny',
                    postalCode: '33101',
                    countryCode: 'us',
                },
            },
            items: [
                { name: 'Platform subscription', quantity: 1, unitCost: 1250 },
                { name: 'API calls (millions)', quantity: 12, unitCost: 18.75 },
            ],
        });
        const warning = await invoice.applyTax();
        expect(warning).toEqual(expect.stringContaining('WARNING'));
        expect(invoice.salesTaxRate).toBe(0);
        expect(invoice.taxAmount).toBe(0);
    });

    it('uses the production authority for production accounts', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_lumen',
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxCategory: '40030',
                taxJarApiKey: 'tjk_prd_lumen_7c30',
                accountState: AccountState.production,
                country: 'gb',
                postalCode: 'EC2A 1AS',
                city: 'London',
                addressLine1: '12 Finsbury Square',
                vatId: 'GB 428 6721 09',
            },
            customer: {
                customerId: 'cus_ironvale',
                customerName: 'Ironvale Systems',
                email: 'ap@ironvale.example',
                taxExempt: TaxExempt.none,
                address: {
                    streetLineOne: '301 Congress Avenue',
                    city: 'Austin',
                    state: 'tx',
                    postalCode: '78701',
                    countryCode: 'us',
                },
            },
            items: [
                { name: 'Engineer seats', quantity: 18, unitCost: 65 },
                { name: 'Support retainer', quantity: 1, unitCost: 192.5 },
            ],
        });
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toBe(0.04125);
        expect(invoice.taxAmount).toBeCloseTo(56.203125);
    });

    it('applies a business-maintained rate for manual tax', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_harbourgate',
                taxCalculationType: TaxCalculationType.manual,
                taxRate: '0.19',
                country: 'de',
                postalCode: '10178',
                city: 'Berlin',
                addressLine1: 'Rosenthaler Strasse 40',
                vatId: 'DE 129 273 060',
            },
            customer: {
                customerId: 'cus_dunmore',
                customerName: 'Dunmore Trading',
                email: 'accounts@dunmore.example',
                customerVatId: 'IE 6388047V',
                taxExempt: TaxExempt.none,
                address: {
                    streetLineOne: "25 Sir John Rogerson's Quay",
                    city: 'Dublin',
                    state: 'Leinster',
                    postalCode: 'D02 X285',
                    countryCode: 'ie',
                },
            },
            items: [
                { name: 'Platform subscription', quantity: 1, unitCost: 1250 },
                { name: 'API calls (millions)', quantity: 12, unitCost: 18.75 },
            ],
        });
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toBe(0.19);
        expect(invoice.taxAmount).toBe(280.25);
    });

    it('collects nothing when tax calculation type is none', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_pinecrest',
                taxCalculationType: TaxCalculationType.none,
                taxRate: '0.07',
                country: 'us',
                postalCode: '98104',
                state: 'wa',
                city: 'Seattle',
                addressLine1: '600 1st Avenue',
            },
            customer: {
                customerId: 'cus_ashgrove',
                customerName: 'Ashgrove Retail',
                email: 'ap@ashgrove.example',
                taxExempt: TaxExempt.none,
                address: {
                    streetLineOne: '1200 5th Avenue',
                    city: 'Seattle',
                    state: 'wa',
                    postalCode: '98104',
                    countryCode: 'us',
                },
            },
            items: [
                { name: 'Ingest volume (GB)', quantity: 340, unitCost: 0.85 },
                { name: 'Retained series', quantity: 25, unitCost: 44.0 },
            ],
        });
        await invoice.applyTax();
        expect(invoice.salesTaxRate).toBe(0);
        expect(invoice.taxAmount).toBe(0);
    });

    it('files a settled sale under the invoice number', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_northwind',
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxCategory: '31000',
                taxJarApiKey: 'tjk_sbx_northwind_a41f',
                accountState: AccountState.sandbox,
                country: 'us',
                postalCode: '19801',
                state: 'de',
                city: 'Wilmington',
                addressLine1: '1209 Orange Street',
            },
            customer: {
                customerId: 'cus_hartwell',
                customerName: 'Hartwell Media',
                email: 'ap@hartwell.example',
                taxExempt: TaxExempt.none,
                address: {
                    streetLineOne: '412 West 38th Street',
                    streetLineTwo: 'Floor 6',
                    city: 'New York',
                    state: 'ny',
                    postalCode: '10018',
                    countryCode: 'us',
                },
            },
            items: [
                { name: 'Platform subscription', quantity: 1, unitCost: 1250 },
                { name: 'API calls (millions)', quantity: 12, unitCost: 18.75 },
            ],
        });
        invoice.invoiceId = 'e8baf17d-b259-5107-b42b-9e06e2a81545';
        await invoice.applyTax();
        await invoice.fileSettledSale();
        const listed = await fetch('http://127.0.0.1:4566/taxjar/sandbox/v2/transactions/orders', {
            headers: { Authorization: 'Bearer tjk_sbx_northwind_a41f' },
        });
        const body = await listed.json();
        expect(body.orders).toContain('e8baf17d-b259-5107-b42b-9e06e2a81545');
    });

    it('rejects meteringcoCalculated invoices without a TaxJar key', async () => {
        const invoice = buildInvoice({
            settings: {
                businessID: 'biz_marchetti',
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxJarApiKey: '',
                country: 'us',
                postalCode: '94108',
                state: 'ca',
                city: 'San Francisco',
                addressLine1: '88 Kearny Street',
            },
            customer: {
                customerId: 'cus_caldwell',
                customerName: 'Caldwell Studios',
                email: 'ap@caldwell.example',
                taxExempt: TaxExempt.none,
                address: {
                    streetLineOne: '1355 Market Street',
                    city: 'San Francisco',
                    state: 'ca',
                    postalCode: '94103',
                    countryCode: 'us',
                },
            },
            items: [{ name: 'Platform subscription', quantity: 1, unitCost: 1250 }],
        });
        await expect(invoice.applyTax()).rejects.toThrow('TaxJar API Key is not set');
    });
});
