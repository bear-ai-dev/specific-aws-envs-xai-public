import { Logger } from '@nestjs/common';
import Taxjar from 'taxjar';
import { AccountState } from '../setting/entities/AccountState.js';
import { createTaxJarClient } from '../setting/dto/validTaxJarApiKey.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditScope } from '../audit/entities/audit.interface.js';
import { serializeError } from 'serialize-error';

export const INVOICE_TAX_WARNING = 'WARNING Errors occured while generating invoice, invoice still generated';

export type TaxAuthorityQuote = {
    rate: number;
    amountToCollect: number;
};

export type TaxAuthorityAddress = {
    country?: string;
    zip?: string;
    state?: string;
    city?: string;
    street?: string;
};

export type TaxAuthorityLine = {
    quantity: number;
    unitCost: number;
};

export class TaxAuthority {
    private static readonly logger = new Logger(TaxAuthority.name);

    static client(apiKey: string, accountState?: AccountState | string): Taxjar {
        return createTaxJarClient(apiKey, accountState);
    }

    static async quoteDestinationTax({
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
        lineItems: TaxAuthorityLine[];
        productTaxCode?: string;
    }): Promise<TaxAuthorityQuote> {
        const client = TaxAuthority.client(apiKey, accountState);
        const response = await client.taxForOrder({
            from_country: from.country,
            from_zip: from.zip,
            from_state: from.state,
            from_city: from.city,
            from_street: from.street,
            to_country: to.country,
            to_zip: to.zip,
            to_state: to.state,
            to_city: to.city,
            to_street: to.street,
            shipping: 0,
            line_items: lineItems.map((item) => ({
                quantity: item.quantity,
                product_tax_code: productTaxCode,
                unit_price: item.unitCost,
            })),
        });
        return {
            rate: response.tax?.rate ?? 0,
            amountToCollect: response.tax?.amount_to_collect ?? 0,
        };
    }

    static async fileSettledSale({
        apiKey,
        accountState,
        invoiceId,
        to,
        amount,
        salesTax,
    }: {
        apiKey: string;
        accountState?: AccountState | string;
        invoiceId: string;
        to: TaxAuthorityAddress;
        amount: number;
        salesTax: number;
    }): Promise<void> {
        const client = TaxAuthority.client(apiKey, accountState);
        await client.createOrder({
            provider: 'meteringco',
            to_country: to.country,
            to_zip: to.zip,
            to_state: to.state,
            to_city: to.city,
            to_street: to.street,
            amount,
            shipping: 0.0,
            sales_tax: salesTax,
            transaction_id: invoiceId,
            transaction_date: new Date().toISOString(),
        });
    }

    static reportNonBlockingError(error: unknown): string {
        TaxAuthority.logger.error('Tax authority request failed; continuing invoice generation');
        AuditService.publishEvent({
            topic: AuditScope.ERROR,
            message: INVOICE_TAX_WARNING,
            data: [serializeError(error)],
        });
        return INVOICE_TAX_WARNING;
    }
}
