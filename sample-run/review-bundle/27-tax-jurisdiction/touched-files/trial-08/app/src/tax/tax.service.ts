import { Injectable, Logger } from '@nestjs/common';
import Taxjar from 'taxjar';
import { ReadSettingsResponseData } from '../setting/dto/read-setting.dto.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditScope } from '../audit/entities/audit.interface.js';
import { serializeError } from 'serialize-error';
import { default as euCountries } from '../setting/euCountries.json';
import { default as countryCodes } from '../setting/countryCode.json';

const DEFAULT_TAX_RESULT = { salesTaxRate: 0, taxAmount: 0 };

export interface TaxLineItemLike {
    quantity: number;
    unitCost: number;
}

export interface TaxableInvoiceLike {
    invoiceId?: string;
    businessID?: string;
    customerId?: string;
    totalAmountWithoutTax: number;
    taxAmount?: number;
    invoiceDate?: Date;
    invoiceLineItems?: { getLineItems(): TaxLineItemLike[] };
    fromCountry?: string;
    fromPostalCode?: string;
    fromState?: string;
    fromCity?: string;
    fromStreetLine1?: string;
    fromStreetLine2?: string;
    toCountry?: string;
    toPostalCode?: string;
    toState?: string;
    toCity?: string;
    toStreetLine1?: string;
    toStreetLine2?: string;
}

export interface TaxableCustomerLike {
    customerId?: string;
    taxExempt?: TaxExempt;
    address?: {
        countryCode?: string;
        postalCode?: string;
        state?: string;
        city?: string;
        streetLineOne?: string;
        streetLineTwo?: string;
    };
}

@Injectable()
export class TaxService {
    private static readonly logger = new Logger(TaxService.name);

    /**
     * Calculate tax for an invoice based on the business tax configuration
     * and the customer's exemption status.
     *
     * - taxExempt customers are always charged nothing
     * - TaxCalculationType.none: no tax
     * - TaxCalculationType.manual: apply the rate the business maintains
     * - TaxCalculationType.meteringcoCalculated: price against the buyer's destination via TaxJar
     *
     * A refused / invalid address is reported via the audit log without
     * stopping invoice generation.
     */
    async calculateTax({
        invoice,
        settings,
        customer,
    }: {
        invoice: TaxableInvoiceLike;
        settings: ReadSettingsResponseData;
        customer: TaxableCustomerLike;
    }): Promise<{ salesTaxRate: number; taxAmount: number }> {
        if (customer?.taxExempt === TaxExempt.exempt) {
            TaxService.logger.log(`Customer ${customer.customerId} is tax exempt. Charging no tax.`);
            return { ...DEFAULT_TAX_RESULT };
        }

        const taxCalculationType = settings?.taxCalculationType ?? TaxCalculationType.none;

        if (taxCalculationType === TaxCalculationType.none || !taxCalculationType) {
            return { ...DEFAULT_TAX_RESULT };
        }

        if (taxCalculationType === TaxCalculationType.manual) {
            return this.calculateManualTax(invoice, settings);
        }

        if (taxCalculationType === TaxCalculationType.meteringcoCalculated) {
            return this.calculateMeteringCoTax(invoice, settings, customer);
        }

        return { ...DEFAULT_TAX_RESULT };
    }

    private calculateManualTax(
        invoice: TaxableInvoiceLike,
        settings: ReadSettingsResponseData,
    ): { salesTaxRate: number; taxAmount: number } {
        const parsedRate = parseFloat(settings?.taxRate);
        let salesTaxRate = Number.isFinite(parsedRate) ? parsedRate : 0;
        if (salesTaxRate > 1) {
            salesTaxRate = salesTaxRate / 100;
        }
        const taxAmount = parseFloat((invoice.totalAmountWithoutTax * salesTaxRate).toFixed(2));
        TaxService.logger.log(`Manual tax calculation: rate=${salesTaxRate}, amount=${taxAmount}`);
        return { salesTaxRate, taxAmount };
    }

    private async calculateMeteringCoTax(
        invoice: TaxableInvoiceLike,
        settings: ReadSettingsResponseData,
        customer: TaxableCustomerLike,
    ): Promise<{ salesTaxRate: number; taxAmount: number }> {
        try {
            const client = this.getTaxJarClient(settings);
            const lineItems = (invoice.invoiceLineItems?.getLineItems() || []).map((item, index) => ({
                id: String(index + 1),
                quantity: item.quantity,
                unit_price: item.unitCost,
                product_tax_code: settings.taxCategory || undefined,
            }));

            const params = {
                from_country: TaxService.normalizeCountry(invoice.fromCountry || settings.country),
                from_zip: invoice.fromPostalCode || settings.postalCode,
                from_state: invoice.fromState || settings.state,
                from_city: invoice.fromCity || settings.city,
                from_street: [invoice.fromStreetLine1 || settings.addressLine1, invoice.fromStreetLine2]
                    .filter(Boolean)
                    .join(' '),
                to_country: TaxService.normalizeCountry(invoice.toCountry || customer.address?.countryCode),
                to_zip: invoice.toPostalCode || customer.address?.postalCode,
                to_state: invoice.toState || customer.address?.state,
                to_city: invoice.toCity || customer.address?.city,
                to_street: [invoice.toStreetLine1 || customer.address?.streetLineOne, invoice.toStreetLine2]
                    .filter(Boolean)
                    .join(' '),
                amount: invoice.totalAmountWithoutTax,
                shipping: 0,
                line_items: lineItems,
            };

            TaxService.logger.log(
                `Requesting TaxJar tax for invoice ${invoice.invoiceId} from ${params.from_country} to ${params.to_country}`,
            );

            const res = await client.taxForOrder(params);
            const salesTaxRate = res?.tax?.rate ?? 0;
            const taxAmount = parseFloat((res?.tax?.amount_to_collect ?? 0).toFixed(2));
            TaxService.logger.log(`TaxJar tax calculation: rate=${salesTaxRate}, amount=${taxAmount}`);
            return { salesTaxRate, taxAmount };
        } catch (error) {
            TaxService.logger.error(`TaxJar tax calculation failed: ${JSON.stringify(serializeError(error))}`);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: `TaxJar refused address or failed tax calculation for invoice ${invoice.invoiceId}`,
                data: [
                    {
                        invoiceId: invoice.invoiceId,
                        businessID: invoice.businessID,
                        customerId: invoice.customerId,
                        error: serializeError(error),
                    },
                ],
            });
            return { ...DEFAULT_TAX_RESULT };
        }
    }

    /**
     * File a settled sale back to the tax authority under the invoice number
     * so the returns reconcile.
     */
    async createOrder({
        invoice,
        settings,
        customer,
    }: {
        invoice: TaxableInvoiceLike;
        settings: ReadSettingsResponseData;
        customer?: TaxableCustomerLike;
    }): Promise<void> {
        if (settings?.taxCalculationType !== TaxCalculationType.meteringcoCalculated) {
            return;
        }
        if (!settings.taxJarApiKey) {
            TaxService.logger.warn(
                `Cannot file TaxJar order for invoice ${invoice.invoiceId}: missing taxJarApiKey`,
            );
            return;
        }

        try {
            const client = this.getTaxJarClient(settings);
            const lineItems = (invoice.invoiceLineItems?.getLineItems() || []).map((item, index) => ({
                id: String(index + 1),
                quantity: item.quantity,
                unit_price: item.unitCost,
                product_tax_code: settings.taxCategory || undefined,
                sales_tax: 0,
            }));

            await client.createOrder({
                transaction_id: invoice.invoiceId,
                transaction_date: invoice.invoiceDate
                    ? invoice.invoiceDate.toISOString()
                    : new Date().toISOString(),
                from_country: TaxService.normalizeCountry(invoice.fromCountry || settings.country),
                from_zip: invoice.fromPostalCode || settings.postalCode,
                from_state: invoice.fromState || settings.state,
                from_city: invoice.fromCity || settings.city,
                from_street: [invoice.fromStreetLine1 || settings.addressLine1, invoice.fromStreetLine2]
                    .filter(Boolean)
                    .join(' '),
                to_country: TaxService.normalizeCountry(invoice.toCountry || customer?.address?.countryCode),
                to_zip: invoice.toPostalCode || customer?.address?.postalCode || '',
                to_state: invoice.toState || customer?.address?.state || '',
                to_city: invoice.toCity || customer?.address?.city,
                to_street: [invoice.toStreetLine1 || customer?.address?.streetLineOne, invoice.toStreetLine2]
                    .filter(Boolean)
                    .join(' '),
                amount: invoice.totalAmountWithoutTax,
                shipping: 0,
                sales_tax: invoice.taxAmount ?? 0,
                line_items: lineItems,
            });
            TaxService.logger.log(`Filed TaxJar order for invoice ${invoice.invoiceId}`);
        } catch (error) {
            TaxService.logger.error(
                `Failed to file TaxJar order for invoice ${invoice.invoiceId}: ${JSON.stringify(
                    serializeError(error),
                )}`,
            );
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: `Failed to file TaxJar order for invoice ${invoice.invoiceId}`,
                data: [
                    {
                        invoiceId: invoice.invoiceId,
                        businessID: invoice.businessID,
                        error: serializeError(error),
                    },
                ],
            });
        }
    }

    /**
     * Validate a TaxJar API key against the sandbox or production authority
     * according to the account the business is on.
     */
    async validateApiKey(apiKey: string, accountState?: AccountState): Promise<boolean> {
        if (!apiKey) {
            return false;
        }
        try {
            const client = this.buildClient(apiKey, accountState);
            await client.categories();
            return true;
        } catch (error) {
            TaxService.logger.error(`TaxJar API key validation failed: ${JSON.stringify(serializeError(error))}`);
            return false;
        }
    }

    getTaxJarClient(settings: ReadSettingsResponseData): Taxjar {
        return this.buildClient(settings.taxJarApiKey, settings.accountState);
    }

    buildClient(apiKey: string, accountState?: AccountState): Taxjar {
        const apiUrl =
            accountState === AccountState.production ? process.env.PROD_TAX_JAR_URL : process.env.TAX_JAR_URL;
        return new Taxjar({
            apiKey,
            apiUrl,
        });
    }

    /**
     * TaxJar expects ISO 3166-1 alpha-2 country codes in uppercase.
     */
    static normalizeCountry(country?: string): string {
        if (!country) {
            return '';
        }
        const lower = country.toLowerCase();
        if (lower === 'uk' || lower === 'united kingdom') {
            return 'GB';
        }
        if (lower === 'el') {
            return 'GR';
        }
        const match = (countryCodes as Array<{ alpha2: string; alpha3: string }>).find(
            ({ alpha2, alpha3 }) => alpha2 === lower || alpha3 === lower,
        );
        if (match) {
            return match.alpha2.toUpperCase();
        }
        return country.toUpperCase();
    }

    /**
     * True when both sides of an invoice are in the European Union
     * (including the UK as listed in euCountries).
     */
    static areBothPartiesEuropean(fromCountry?: string, toCountry?: string): boolean {
        if (!fromCountry || !toCountry) {
            return false;
        }
        const eu = (euCountries as string[]).map((c) => c.toUpperCase());
        const fromNormalized = TaxService.normalizeCountry(fromCountry);
        const toNormalized = TaxService.normalizeCountry(toCountry);
        const fromRaw = fromCountry.toUpperCase();
        const toRaw = toCountry.toUpperCase();
        const fromIsEu = eu.includes(fromNormalized) || eu.includes(fromRaw);
        const toIsEu = eu.includes(toNormalized) || eu.includes(toRaw);
        return fromIsEu && toIsEu;
    }
}
