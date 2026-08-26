import { Logger } from '@nestjs/common';
import { AccountState } from '../setting/entities/AccountState.js';
import Taxjar from 'taxjar';

const logger = new Logger('TaxJar');

export type TaxJarLineItem = {
    quantity: number;
    product_tax_code?: string;
    unit_price: number;
};

export type TaxForOrderParams = {
    from_country: string;
    from_zip: string;
    from_state: string;
    from_city: string;
    from_street: string;
    to_country: string;
    to_zip: string;
    to_state: string;
    to_city: string;
    to_street: string;
    shipping: number;
    line_items: TaxJarLineItem[];
};

export type CreateOrderParams = {
    provider: string;
    to_country: string;
    to_zip: string;
    to_state: string;
    to_city: string;
    to_street: string;
    amount: number;
    shipping: number;
    sales_tax: number;
    transaction_id: string;
};

export type TaxForOrderResult = {
    rate: number;
    amount_to_collect: number;
};

function trimTrailingSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function taxJarApiUrlForAccount(accountState?: AccountState): string {
    const productionUrl = process.env.PROD_TAX_JAR_URL || 'https://api.taxjar.com';
    const sandboxUrl = process.env.TAX_JAR_URL || 'https://api.sandbox.taxjar.com';
    const url = accountState === AccountState.production ? productionUrl : sandboxUrl;
    return trimTrailingSlash(url);
}

export function createTaxJarClient(apiKey: string, accountState?: AccountState) {
    return new Taxjar({
        apiKey,
        apiUrl: taxJarApiUrlForAccount(accountState),
    });
}

export async function validateTaxJarApiKey(apiKey: string, accountState?: AccountState): Promise<void> {
    const client = createTaxJarClient(apiKey, accountState);
    await client.categories();
}

export async function taxForOrder(
    apiKey: string,
    accountState: AccountState | undefined,
    params: TaxForOrderParams,
): Promise<TaxForOrderResult> {
    const client = createTaxJarClient(apiKey, accountState);
    const res = await client.taxForOrder(params);
    return {
        rate: Number(res?.tax?.rate) || 0,
        amount_to_collect: Number(res?.tax?.amount_to_collect) || 0,
    };
}

export async function createTaxJarOrder(
    apiKey: string,
    accountState: AccountState | undefined,
    params: CreateOrderParams,
): Promise<void> {
    const client = createTaxJarClient(apiKey, accountState);
    await client.createOrder(params);
}

export function logTaxJarError(context: string, error: unknown): void {
    logger.error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}
