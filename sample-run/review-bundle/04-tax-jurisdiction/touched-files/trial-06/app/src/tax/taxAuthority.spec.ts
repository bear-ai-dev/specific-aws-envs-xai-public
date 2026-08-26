import { Invoice, InvoiceLineItem, InvoiceLineItems } from '../invoice/entities/invoice.entity.js';
import { InvoiceStatus } from '../invoice/entities/InvoiceStatus.js';
import { InvoiceApproval } from '../setting/dto/InvoiceApproval.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { paymentChannel } from '../customer/dto/create-customer.dto.js';
import { TaxAuthority } from './taxAuthority.js';

const taxForDestination = jest.spyOn(TaxAuthority, 'taxForDestination');
const fileOrder = jest.spyOn(TaxAuthority, 'fileOrder');
const reportAddressRefusal = jest.spyOn(TaxAuthority, 'reportAddressRefusal');

const buildInvoice = ({
    items = [
        { name: 'Platform subscription', quantity: 1, unitCost: 1250 },
        { name: 'API calls (millions)', quantity: 12, unitCost: 18.75 },
    ],
    settings = {},
    customer = {},
}: {
    items?: Array<{ name: string; quantity: number; unitCost: number }>;
    settings?: Record<string, unknown>;
    customer?: Record<string, unknown>;
} = {}) => {
    const invoiceLineItems = new InvoiceLineItems();
    items.forEach((item) => invoiceLineItems.addLineItem(new InvoiceLineItem(item.name, item.quantity, item.unitCost)));
    const invoice = new Invoice({
        customerId: 'cus_hartwell',
        businessID: 'biz_northwind',
        invoiceId: 'inv-1',
        invoiceLineItems,
    });
    invoice.saveToDB = jest.fn();
    invoice.loadPropertiesFromSettingsEntity({
        addressLine1: '1209 Orange Street',
        addressLine2: 'Suite 400',
        city: 'Wilmington',
        state: 'de',
        country: 'us',
        postalCode: '19801',
        businessName: 'Northwind Analytics',
        vatId: 'US-EIN-51-0793344',
        taxCalculationType: TaxCalculationType.meteringcoCalculated,
        taxRate: '0',
        taxCategory: '31000',
        taxJarApiKey: 'tjk_sbx_northwind_a41f',
        accountState: AccountState.sandbox,
        invoiceApproval: InvoiceApproval.manual,
        ...settings,
    });
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
        taxExempt: TaxExempt.none,
        customerVatId: '',
        offering: { offeringName: 'Test', offeringId: 'o1', dimensions: [] },
        ...customer,
    } as any);
    return invoice;
};

describe('Invoice tax calculation', () => {
    beforeEach(() => {
        taxForDestination.mockReset();
        fileOrder.mockReset();
        reportAddressRefusal.mockReset();
        taxForDestination.mockResolvedValue({ rate: 0.06, amount: 88.5 });
        fileOrder.mockResolvedValue(undefined);
        reportAddressRefusal.mockImplementation(() => undefined);
        process.env.TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/sandbox';
        process.env.PROD_TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/production';
    });

    it('prices a destination against the authority and stores rate, tax and gross', async () => {
        const invoice = buildInvoice();
        await invoice.generate(true);
        expect(taxForDestination).toHaveBeenCalledWith(
            expect.objectContaining({
                apiKey: 'tjk_sbx_northwind_a41f',
                accountState: AccountState.sandbox,
                productTaxCode: '31000',
                from: expect.objectContaining({
                    country: 'us',
                    zip: '19801',
                    state: 'de',
                    city: 'Wilmington',
                    street: '1209 Orange Street',
                }),
                to: expect.objectContaining({
                    country: 'us',
                    zip: '10018',
                    state: 'ny',
                    city: 'New York',
                    street: '412 West 38th Street',
                }),
            }),
        );
        expect(invoice.salesTaxRate).toEqual(0.06);
        expect(invoice.taxAmount).toEqual(88.5);
        expect(invoice.total).toEqual(1563.5);
        expect(invoice.totalAmountWithoutTax).toEqual(1475);
    });

    it('uses the production authority for production accounts', async () => {
        const invoice = buildInvoice({
            settings: {
                accountState: AccountState.production,
                taxJarApiKey: 'tjk_prd_lumen_7c30',
                taxCategory: '40030',
            },
        });
        taxForDestination.mockResolvedValue({ rate: 0.04125, amount: 56.2 });
        await invoice.generate(true);
        expect(taxForDestination).toHaveBeenCalledWith(
            expect.objectContaining({
                apiKey: 'tjk_prd_lumen_7c30',
                accountState: AccountState.production,
                productTaxCode: '40030',
            }),
        );
        expect(invoice.salesTaxRate).toEqual(0.04125);
        expect(invoice.taxAmount).toBeCloseTo(60.84375, 5);
    });

    it('applies a business-maintained rate when configured as manual', async () => {
        const invoice = buildInvoice({
            settings: {
                taxCalculationType: TaxCalculationType.manual,
                taxRate: '0.19',
            },
        });
        await invoice.generate(true);
        expect(taxForDestination).not.toHaveBeenCalled();
        expect(invoice.salesTaxRate).toEqual(0.19);
        expect(invoice.taxAmount).toEqual(280.25);
        expect(invoice.total).toEqual(1755.25);
    });

    it('collects nothing when the business is configured to collect nothing', async () => {
        const invoice = buildInvoice({
            settings: {
                taxCalculationType: TaxCalculationType.none,
                taxRate: '0.07',
            },
        });
        await invoice.generate(true);
        expect(taxForDestination).not.toHaveBeenCalled();
        expect(invoice.salesTaxRate).toEqual(0);
        expect(invoice.taxAmount).toEqual(0);
        expect(invoice.total).toEqual(1475);
    });

    it('charges nothing when the customer is tax exempt, regardless of configuration', async () => {
        const invoice = buildInvoice({
            customer: { taxExempt: TaxExempt.exempt },
        });
        await invoice.generate(true);
        expect(taxForDestination).not.toHaveBeenCalled();
        expect(invoice.salesTaxRate).toEqual(0);
        expect(invoice.taxAmount).toEqual(0);
        expect(invoice.total).toEqual(1475);
    });

    it('reports a refused address and still issues the invoice untaxed', async () => {
        const invoice = buildInvoice({
            customer: {
                address: {
                    streetLineOne: '77 Water Street',
                    streetLineTwo: '',
                    countryCode: 'us',
                    city: 'New York',
                    state: 'ny',
                    postalCode: '33101',
                },
            },
        });
        taxForDestination.mockRejectedValue({ status: 400, detail: 'to_zip is not a valid postal code for to_state' });
        await invoice.generate(true);
        expect(reportAddressRefusal).toHaveBeenCalled();
        expect(invoice.salesTaxRate).toEqual(0);
        expect(invoice.taxAmount).toEqual(0);
        expect(invoice.invoiceId).toBeDefined();
        expect(invoice.saveToDB).toHaveBeenCalled();
    });

    it('rejects destination pricing when the business has no authority key', async () => {
        const invoice = buildInvoice({
            settings: { taxJarApiKey: '' },
        });
        await expect(invoice.generate(true)).rejects.toThrow('TaxJar API Key is not set');
        expect(invoice.saveToDB).not.toHaveBeenCalled();
    });

    it('files the sale under the invoice number once the invoice is settled', async () => {
        const invoice = buildInvoice();
        await invoice.generate(true);
        await invoice.updateStatus(InvoiceStatus.OPEN);
        await invoice.updateStatus(InvoiceStatus.PAID);
        expect(fileOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                apiKey: 'tjk_sbx_northwind_a41f',
                transactionId: 'inv-1',
                amount: 1475,
                salesTax: 88.5,
                to: expect.objectContaining({
                    street: '412 West 38th Street Floor 6',
                    zip: '10018',
                    state: 'ny',
                    country: 'us',
                }),
            }),
        );
    });

    it('shows both sides VAT registrations on invoices between European parties', async () => {
        const invoice = buildInvoice({
            settings: {
                taxCalculationType: TaxCalculationType.manual,
                taxRate: '0.19',
                country: 'de',
                vatId: 'DE 129 273 060',
                city: 'Berlin',
                postalCode: '10178',
                addressLine1: 'Rosenthaler Strasse 40',
                addressLine2: '',
                state: '',
                businessName: 'Harbourgate Systems GmbH',
            },
            customer: {
                customerName: 'Dunmore Trading',
                email: 'accounts@dunmore.example',
                customerVatId: 'IE 6388047V',
                address: {
                    streetLineOne: "25 Sir John Rogerson's Quay",
                    streetLineTwo: '',
                    city: 'Dublin',
                    state: 'Leinster',
                    postalCode: 'D02 X285',
                    countryCode: 'ie',
                },
            },
        });
        await invoice.generate(true);
        expect(invoice.fromEntity).toContain('VAT Registration Number: DE 129 273 060');
        expect(invoice.toEntity).toContain('VAT Registration Number: IE 6388047V');
    });

    it('does not print VAT on a US invoice', async () => {
        const invoice = buildInvoice();
        await invoice.generate(true);
        expect(invoice.fromEntity).not.toContain('VAT Registration Number');
        expect(invoice.toEntity).not.toContain('VAT Registration Number');
    });

    it('routes sandbox vs production authority URLs from the environment', () => {
        expect(TaxAuthority.apiUrlForAccount(AccountState.sandbox)).toEqual('http://127.0.0.1:4566/taxjar/sandbox');
        expect(TaxAuthority.apiUrlForAccount(AccountState.production)).toEqual(
            'http://127.0.0.1:4566/taxjar/production',
        );
    });
});

