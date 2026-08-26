import { Logger } from '@nestjs/common';
import Taxjar from 'taxjar';
import { AccountState } from '../setting/entities/AccountState.js';
export interface TaxableLineItem {
    quantity: number;
    unitCost: number;
}

export function taxJarApiUrl(accountState?: AccountState): string {
    const raw =
        accountState === AccountState.production
            ? process.env.PROD_TAX_JAR_URL || Taxjar.DEFAULT_API_URL
            : process.env.TAX_JAR_URL || Taxjar.SANDBOX_API_URL;
    return raw.replace(/\/+$/, '');
}

export function createTaxJarClient(apiKey: string, accountState?: AccountState): Taxjar {
    return new Taxjar({
        apiKey,
        apiUrl: taxJarApiUrl(accountState),
    });
}

export interface TaxForOrderAddresses {
    fromCountry?: string;
    fromPostalCode?: string;
    fromState?: string;
    fromCity?: string;
    fromStreet?: string;
    toCountry?: string;
    toPostalCode?: string;
    toState?: string;
    toCity?: string;
    toStreet?: string;
}

export interface CalculatedTax {
    rate: number;
    amountToCollect: number;
}

export class TaxJarClient {
    private static readonly logger = new Logger(TaxJarClient.name);

    constructor(
        private readonly apiKey: string,
        private readonly accountState?: AccountState,
        private readonly client: Taxjar = createTaxJarClient(apiKey, accountState),
    ) {}

    async taxForOrder({
        addresses,
        lineItems,
        taxCategory,
    }: {
        addresses: TaxForOrderAddresses;
        lineItems: TaxableLineItem[];
        taxCategory?: string;
    }): Promise<CalculatedTax> {
        const params = {
            from_country: addresses.fromCountry || '',
            from_zip: addresses.fromPostalCode || '',
            from_state: addresses.fromState || '',
            from_city: addresses.fromCity || '',
            from_street: addresses.fromStreet || '',
            to_country: addresses.toCountry || '',
            to_zip: addresses.toPostalCode || '',
            to_state: addresses.toState || '',
            to_city: addresses.toCity || '',
            to_street: addresses.toStreet || '',
            shipping: 0,
            line_items: lineItems.map((item) => ({
                quantity: item.quantity,
                unit_price: item.unitCost,
                product_tax_code: taxCategory || undefined,
            })),
        };
        TaxJarClient.logger.log(`Requesting tax for order from TaxJar`);
        const res = await this.client.taxForOrder(params);
        return {
            rate: res.tax?.rate ?? 0,
            amountToCollect: res.tax?.amount_to_collect ?? 0,
        };
    }

    async createOrder({
        transactionId,
        toCountry,
        toPostalCode,
        toState,
        toCity,
        toStreet,
        amount,
        salesTax,
    }: {
        transactionId: string;
        toCountry?: string;
        toPostalCode?: string;
        toState?: string;
        toCity?: string;
        toStreet?: string;
        amount: number;
        salesTax: number;
    }): Promise<void> {
        TaxJarClient.logger.log(`Filing order ${transactionId} with TaxJar`);
        await this.client.createOrder({
            transaction_id: transactionId,
            transaction_date: new Date().toISOString(),
            provider: 'meteringco',
            to_country: toCountry || '',
            to_zip: toPostalCode || '',
            to_state: toState || '',
            to_city: toCity || '',
            to_street: toStreet || '',
            amount,
            shipping: 0.0,
            sales_tax: salesTax,
        });
    }
}
