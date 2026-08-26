import { Logger } from '@nestjs/common';
import { AccountState } from '../setting/entities/AccountState.js';
import { TaxCalculationType } from '../setting/dto/TaxCalculationType.js';
import { TaxExempt } from '../customer/dto/TaxExempt.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditScope } from '../audit/entities/audit.interface.js';
import { serializeError } from 'serialize-error';
import { default as countryCodes } from '../setting/countryCode.json';
import { default as euCountries } from '../setting/euCountries.json';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Taxjar = require('taxjar');

const logger = new Logger('TaxCalculator');

export type TaxableAddress = {
    streetLine1?: string;
    streetLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
};

export type TaxableLineItem = {
    name: string;
    quantity: number;
    unitCost: number;
    description?: string;
};

export type TaxCalculationInput = {
    from: TaxableAddress;
    to: TaxableAddress;
    lineItems: TaxableLineItem[];
    amount: number;
    taxCalculationType?: TaxCalculationType;
    taxRate?: string;
    taxCategory?: string;
    taxJarApiKey?: string;
    accountState?: AccountState;
    taxExempt?: TaxExempt;
    invoiceId?: string;
    invoiceDate?: Date;
};

export type TaxCalculationResult = {
    salesTaxRate: number;
    taxAmount: number;
};

const ZERO_TAX: TaxCalculationResult = { salesTaxRate: 0, taxAmount: 0 };

export function normalizeCountryCode(country?: string): string {
    if (!country) {
        return '';
    }
    const trimmed = country.trim();
    if (!trimmed) {
        return '';
    }
    const lower = trimmed.toLowerCase();
    if (lower === 'usa' || lower === 'united states' || lower === 'united states of america') {
        return 'US';
    }
    if (lower === 'uk' || lower === 'united kingdom' || lower === 'great britain' || lower === 'gbr') {
        return 'GB';
    }
    const match = (countryCodes as Array<{ alpha2: string; alpha3: string; name: string }>).find(
        ({ alpha2, alpha3, name }) =>
            alpha2 === lower ||
            alpha3 === lower ||
            name.toLowerCase() === lower ||
            alpha2 === trimmed ||
            alpha3 === trimmed,
    );
    if (match) {
        return match.alpha2.toUpperCase();
    }
    return trimmed.toUpperCase();
}

export function isEuropeanCountry(country?: string): boolean {
    const iso = normalizeCountryCode(country);
    if (!iso) {
        return false;
    }
    const eu = euCountries as string[];
    return eu.includes(iso) || eu.includes(country?.toUpperCase());
}

export function isEuropeanTransaction(fromCountry?: string, toCountry?: string): boolean {
    return isEuropeanCountry(fromCountry) && isEuropeanCountry(toCountry);
}

export function parseManualTaxRate(taxRate?: string): number {
    if (!taxRate && taxRate !== '0') {
        return 0;
    }
    const parsed = Number(taxRate);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }
    // Accept either a decimal rate (0.08) or a human percentage (8 / 8.25)
    return parsed > 1 ? parsed / 100 : parsed;
}

export function roundCurrency(value: number): number {
    return parseFloat(value.toFixed(2));
}

export function createTaxJarClient(apiKey: string, accountState?: AccountState) {
    const apiUrl = accountState === AccountState.production ? process.env.PROD_TAX_JAR_URL : process.env.TAX_JAR_URL;
    return new Taxjar({
        apiKey,
        apiUrl,
    });
}

function combineStreet(line1?: string, line2?: string): string | undefined {
    const street = [line1, line2].filter((part) => part && part.trim() !== '').join(' ');
    return street || undefined;
}

function toTaxJarAddress(address: TaxableAddress, prefix: 'from' | 'to') {
    const country = normalizeCountryCode(address.country);
    const street = combineStreet(address.streetLine1, address.streetLine2);
    return {
        [`${prefix}_country`]: country || undefined,
        [`${prefix}_zip`]: address.postalCode || undefined,
        [`${prefix}_state`]: address.state || undefined,
        [`${prefix}_city`]: address.city || undefined,
        [`${prefix}_street`]: street,
    };
}

function toTaxJarLineItems(lineItems: TaxableLineItem[], taxCategory?: string) {
    return lineItems.map((item, index) => ({
        id: String(index + 1),
        quantity: item.quantity,
        product_tax_code: taxCategory || undefined,
        unit_price: item.unitCost,
        description: item.description || item.name,
    }));
}

export async function calculateTax(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    if (input.taxExempt === TaxExempt.exempt) {
        return { ...ZERO_TAX };
    }

    if (!input.taxCalculationType || input.taxCalculationType === TaxCalculationType.none) {
        return { ...ZERO_TAX };
    }

    if (input.taxCalculationType === TaxCalculationType.manual) {
        const salesTaxRate = parseManualTaxRate(input.taxRate);
        return {
            salesTaxRate,
            taxAmount: roundCurrency(input.amount * salesTaxRate),
        };
    }

    if (input.taxCalculationType === TaxCalculationType.meteringcoCalculated) {
        if (!input.taxJarApiKey) {
            logger.warn(`TaxJar API key missing for invoice ${input.invoiceId || 'unknown'}; issuing untaxed`);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'TaxJar API key missing while calculating destination tax',
                data: [{ invoiceId: input.invoiceId }],
            });
            return { ...ZERO_TAX };
        }
        try {
            const client = createTaxJarClient(input.taxJarApiKey, input.accountState);
            const params = {
                ...toTaxJarAddress(input.from, 'from'),
                ...toTaxJarAddress(input.to, 'to'),
                amount: input.amount,
                shipping: 0,
                line_items: toTaxJarLineItems(input.lineItems, input.taxCategory),
            };
            const res = await client.taxForOrder(params);
            const salesTaxRate = Number(res?.tax?.rate) || 0;
            const taxAmount = Number.isFinite(Number(res?.tax?.amount_to_collect))
                ? roundCurrency(Number(res.tax.amount_to_collect))
                : roundCurrency(input.amount * salesTaxRate);
            return { salesTaxRate, taxAmount };
        } catch (error) {
            logger.error(`TaxJar tax calculation failed for invoice ${input.invoiceId || 'unknown'}`);
            logger.error(error);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'TaxJar refused an address or failed to calculate tax; invoice issued without destination tax',
                data: [{ invoiceId: input.invoiceId, error: serializeError(error) }],
            });
            return { ...ZERO_TAX };
        }
    }

    return { ...ZERO_TAX };
}

export async function fileSaleWithTaxAuthority(input: TaxCalculationInput & { salesTax: number }): Promise<void> {
    if (input.taxCalculationType !== TaxCalculationType.meteringcoCalculated || !input.taxJarApiKey) {
        return;
    }
    const transactionId = input.invoiceId;
    if (!transactionId) {
        return;
    }
    const params = {
        transaction_id: transactionId,
        transaction_date: input.invoiceDate ? input.invoiceDate.toISOString() : new Date().toISOString(),
        ...toTaxJarAddress(input.from, 'from'),
        ...toTaxJarAddress(input.to, 'to'),
        amount: input.amount,
        shipping: 0,
        sales_tax: input.salesTax,
        line_items: toTaxJarLineItems(input.lineItems, input.taxCategory),
    };
    const client = createTaxJarClient(input.taxJarApiKey, input.accountState);
    try {
        await client.createOrder(params);
        logger.log(`Filed TaxJar order for invoice ${transactionId}`);
    } catch (createError) {
        try {
            await client.updateOrder(params);
            logger.log(`Updated TaxJar order for invoice ${transactionId}`);
        } catch (updateError) {
            logger.error(`Failed to file TaxJar order for invoice ${transactionId}`);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to file settled invoice sale with tax authority',
                data: [
                    {
                        invoiceId: transactionId,
                        createError: serializeError(createError),
                        updateError: serializeError(updateError),
                    },
                ],
            });
        }
    }
}

export async function validateTaxJarApiKey(apiKey: string, accountState?: AccountState): Promise<boolean> {
    if (!apiKey) {
        return true;
    }
    try {
        const client = createTaxJarClient(apiKey, accountState);
        await client.categories();
        return true;
    } catch (error) {
        logger.debug(`TaxJar API key validation failed: ${JSON.stringify(serializeError(error))}`);
        return false;
    }
}
