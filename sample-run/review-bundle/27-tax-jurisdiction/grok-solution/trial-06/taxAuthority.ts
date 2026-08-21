import { Logger } from '@nestjs/common';
import Taxjar from 'taxjar';
import { AccountState } from '../setting/entities/AccountState.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditScope } from '../audit/entities/audit.interface.js';
import { serializeError } from 'serialize-error';
import { default as euCountries } from '../setting/euCountries.json';

export type TaxAuthorityAddress = {
    country?: string;
    zip?: string;
    state?: string;
    city?: string;
    street?: string;
};

export type CalculatedTax = {
    rate: number;
    amount: number;
};

export type TaxableLine = {
    quantity: number;
    unitCost: number;
};

const stripTrailingSlash = (url: string): string => (url || '').replace(/\/+$/, '');

export class TaxAuthority {
    private static readonly logger = new Logger(TaxAuthority.name);

    static isEuropeanCountry(country?: string): boolean {
        if (!country) {
            return false;
        }
        const normalized = country.toUpperCase();
        return (euCountries as string[]).includes(normalized);
    }

    static apiUrlForAccount(accountState?: AccountState | string): string {
        const isProduction = accountState === AccountState.production || accountState === 'production';
        const configured = isProduction ? process.env.PROD_TAX_JAR_URL : process.env.TAX_JAR_URL;
        return stripTrailingSlash(configured || (isProduction ? Taxjar.DEFAULT_API_URL : Taxjar.SANDBOX_API_URL));
    }

    static createClient(apiKey: string, accountState?: AccountState | string): Taxjar {
        return new Taxjar({
            apiKey,
            apiUrl: TaxAuthority.apiUrlForAccount(accountState),
        });
    }

    static async validateApiKey(apiKey: string, accountState?: AccountState | string): Promise<boolean> {
        if (!apiKey) {
            return true;
        }
        try {
            await TaxAuthority.createClient(apiKey, accountState).categories();
            return true;
        } catch (error) {
            TaxAuthority.logger.warn(`TaxJar API key validation failed: ${JSON.stringify(serializeError(error))}`);
            return false;
        }
    }

    static async taxForDestination({
        apiKey,
        accountState,
        from,
        to,
        lineItems,
        productTaxCode,
    }: {
        apiKey: string;
        accountState?: AccountState | string;
        from: TaxAuthorityAddress;
        to: TaxAuthorityAddress;
        lineItems: TaxableLine[];
        productTaxCode?: string;
    }): Promise<CalculatedTax> {
        const client = TaxAuthority.createClient(apiKey, accountState);
        const res = await client.taxForOrder({
            from_country: from.country || '',
            from_zip: from.zip || '',
            from_state: from.state || '',
            from_city: from.city || '',
            from_street: from.street || '',
            to_country: to.country || '',
            to_zip: to.zip || '',
            to_state: to.state || '',
            to_city: to.city || '',
            to_street: to.street || '',
            shipping: 0,
            line_items: lineItems.map((item) => ({
                quantity: item.quantity,
                product_tax_code: productTaxCode || '',
                unit_price: item.unitCost,
            })),
        });
        return {
            rate: res?.tax?.rate ?? 0,
            amount: res?.tax?.amount_to_collect ?? 0,
        };
    }

    static async fileOrder({
        apiKey,
        accountState,
        transactionId,
        transactionDate,
        to,
        amount,
        salesTax,
    }: {
        apiKey: string;
        accountState?: AccountState | string;
        transactionId: string;
        transactionDate: string;
        to: TaxAuthorityAddress;
        amount: number;
        salesTax: number;
    }): Promise<void> {
        const client = TaxAuthority.createClient(apiKey, accountState);
        await client.createOrder({
            transaction_id: transactionId,
            transaction_date: transactionDate,
            provider: 'meteringco',
            to_country: to.country || '',
            to_zip: to.zip || '',
            to_state: to.state || '',
            to_city: to.city || '',
            to_street: to.street || '',
            amount,
            shipping: 0,
            sales_tax: salesTax,
        });
    }

    static reportAddressRefusal(error: unknown, context: Record<string, unknown>): void {
        TaxAuthority.logger.warn(`Tax authority refused address: ${JSON.stringify(serializeError(error))}`);
        AuditService.publishEvent({
            topic: AuditScope.ERROR,
            message: 'Tax authority refused address; invoice issued without destination tax',
            data: [serializeError(error), context],
        });
    }
}
