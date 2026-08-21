import { BadRequestException, Logger } from '@nestjs/common';
import Taxjar from 'taxjar';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { AccountState } from '../setting/entities/AccountState.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditScope } from '../audit/entities/audit.interface.js';
import { serializeError } from 'serialize-error';
import { default as countryCodes } from '../setting/countryCode.json';

export interface TaxLineItemLike {
    name: string;
    quantity: number;
    unitCost: number;
}

export interface TaxableDocument {
    invoiceId?: string;
    invoiceDate?: Date;
    totalAmountWithoutTax: number;
    taxAmount?: number;
    salesTaxRate?: number;
    invoiceLineItems?: { getLineItems(): TaxLineItemLike[] };
    taxCalculationType?: TaxCalculationType;
    taxRate?: string;
    taxCategory?: string;
    taxJarApiKey?: string;
    accountState?: AccountState;
    taxExempt?: TaxExempt;
    fromStreetLine1?: string;
    fromStreetLine2?: string;
    fromCity?: string;
    fromState?: string;
    fromPostalCode?: string;
    fromCountry?: string;
    toStreetLine1?: string;
    toStreetLine2?: string;
    toCity?: string;
    toState?: string;
    toPostalCode?: string;
    toCountry?: string;
}

export class TaxService {
    private static readonly logger = new Logger(TaxService.name);

    static getApiUrl(accountState?: AccountState): string {
        if (accountState === AccountState.production) {
            return process.env.PROD_TAX_JAR_URL;
        }
        return process.env.TAX_JAR_URL;
    }

    static createClient(apiKey: string, accountState?: AccountState): Taxjar {
        return new Taxjar({
            apiKey,
            apiUrl: TaxService.getApiUrl(accountState),
        });
    }

    static toIsoCountry(code?: string): string {
        if (!code) {
            return '';
        }
        const lower = code.toLowerCase();
        if (lower === 'uk') {
            return 'GB';
        }
        if (lower === 'el') {
            return 'GR';
        }
        const found = (countryCodes as Array<{ alpha2: string; alpha3: string }>).find(
            ({ alpha2, alpha3 }) => alpha2 === lower || alpha3 === lower,
        );
        if (found) {
            return found.alpha2.toUpperCase();
        }
        return code.toUpperCase();
    }

    static parseManualRate(taxRate?: string): number {
        if (!taxRate) {
            return 0;
        }
        const parsed = parseFloat(taxRate);
        if (Number.isNaN(parsed) || parsed === 0) {
            return 0;
        }
        return parsed > 1 ? parsed / 100 : parsed;
    }

    static roundCurrency(value: number): number {
        return parseFloat(value.toFixed(2));
    }

    static buildStreet(line1?: string, line2?: string): string {
        return [line1, line2].filter((part) => part && part !== '').join(' ');
    }

    static buildAddressParams(document: TaxableDocument) {
        return {
            from_country: TaxService.toIsoCountry(document.fromCountry),
            from_zip: document.fromPostalCode || undefined,
            from_state: document.fromState || undefined,
            from_city: document.fromCity || undefined,
            from_street: TaxService.buildStreet(document.fromStreetLine1, document.fromStreetLine2) || undefined,
            to_country: TaxService.toIsoCountry(document.toCountry),
            to_zip: document.toPostalCode || undefined,
            to_state: document.toState || undefined,
            to_city: document.toCity || undefined,
            to_street: TaxService.buildStreet(document.toStreetLine1, document.toStreetLine2) || undefined,
        };
    }

    static buildLineItems(document: TaxableDocument) {
        const items = document.invoiceLineItems?.getLineItems() || [];
        return items.map((item, index) => ({
            id: String(index + 1),
            quantity: item.quantity,
            unit_price: item.unitCost,
            product_tax_code: document.taxCategory || undefined,
            description: item.name,
        }));
    }

    static reportAuthorityError(message: string, error: unknown, extra?: Record<string, unknown>): void {
        TaxService.logger.error(message);
        TaxService.logger.error(error);
        AuditService.publishEvent({
            topic: AuditScope.ERROR,
            message,
            data: [serializeError(error), extra].filter(Boolean),
        });
    }

    static async validateApiKey(apiKey: string, accountState?: AccountState): Promise<void> {
        if (!apiKey) {
            throw new BadRequestException('TaxJar API key is required for destination-based tax calculation');
        }
        try {
            const client = TaxService.createClient(apiKey, accountState);
            await client.categories();
        } catch (error) {
            TaxService.logger.error(error);
            throw new BadRequestException('TaxJar API key is invalid');
        }
    }

    static async calculateForInvoice(document: TaxableDocument): Promise<{ rate: number; amount: number }> {
        if (document.taxExempt === TaxExempt.exempt) {
            return { rate: 0, amount: 0 };
        }
        if (!document.taxCalculationType || document.taxCalculationType === TaxCalculationType.none) {
            return { rate: 0, amount: 0 };
        }
        if (document.taxCalculationType === TaxCalculationType.manual) {
            const rate = TaxService.parseManualRate(document.taxRate);
            return {
                rate,
                amount: TaxService.roundCurrency((document.totalAmountWithoutTax || 0) * rate),
            };
        }
        if (document.taxCalculationType === TaxCalculationType.meteringcoCalculated) {
            return TaxService.calculateWithAuthority(document);
        }
        return { rate: 0, amount: 0 };
    }

    static async calculateWithAuthority(document: TaxableDocument): Promise<{ rate: number; amount: number }> {
        if (!document.taxJarApiKey) {
            TaxService.reportAuthorityError(
                'TaxJar API key is missing for destination-based tax calculation',
                new Error('Missing TaxJar API key'),
                { invoiceId: document.invoiceId },
            );
            return { rate: 0, amount: 0 };
        }
        const addresses = TaxService.buildAddressParams(document);
        if (!addresses.to_country) {
            TaxService.reportAuthorityError(
                'TaxJar refused to price invoice because the destination address is incomplete',
                new Error('Missing destination country'),
                { invoiceId: document.invoiceId, addresses },
            );
            return { rate: 0, amount: 0 };
        }
        try {
            const client = TaxService.createClient(document.taxJarApiKey, document.accountState);
            const res = await client.taxForOrder({
                ...addresses,
                amount: document.totalAmountWithoutTax,
                shipping: 0,
                line_items: TaxService.buildLineItems(document),
            });
            return {
                rate: res?.tax?.rate || 0,
                amount: TaxService.roundCurrency(res?.tax?.amount_to_collect || 0),
            };
        } catch (error) {
            TaxService.reportAuthorityError('TaxJar refused to price invoice destination address', error, {
                invoiceId: document.invoiceId,
                addresses,
            });
            return { rate: 0, amount: 0 };
        }
    }

    static async fileSale(document: TaxableDocument): Promise<void> {
        if (document.taxCalculationType !== TaxCalculationType.meteringcoCalculated || !document.taxJarApiKey) {
            return;
        }
        const addresses = TaxService.buildAddressParams(document);
        if (!addresses.to_country) {
            TaxService.reportAuthorityError(
                'TaxJar refused to file sale because the destination address is incomplete',
                new Error('Missing destination country'),
                { invoiceId: document.invoiceId },
            );
            return;
        }
        try {
            const client = TaxService.createClient(document.taxJarApiKey, document.accountState);
            await client.createOrder({
                transaction_id: document.invoiceId,
                transaction_date: document.invoiceDate ? document.invoiceDate.toISOString() : new Date().toISOString(),
                ...addresses,
                amount: document.totalAmountWithoutTax,
                shipping: 0,
                sales_tax: document.taxAmount || 0,
                exemption_type: document.taxExempt === TaxExempt.exempt ? 'other' : undefined,
                line_items: TaxService.buildLineItems(document).map((item) => ({
                    ...item,
                    sales_tax: 0,
                })),
            });
        } catch (error) {
            TaxService.reportAuthorityError('TaxJar refused to file settled invoice sale', error, {
                invoiceId: document.invoiceId,
            });
        }
    }
}
