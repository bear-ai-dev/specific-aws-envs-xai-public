import { Logger } from '@nestjs/common';
import Taxjar from 'taxjar';
import { AccountState } from '../setting/entities/AccountState.js';
import euCountries from '../setting/euCountries.json';

const logger = new Logger('TaxJarClient');

export function taxJarApiUrlForAccountState(accountState?: AccountState): string {
    if (accountState === AccountState.production) {
        return process.env.PROD_TAX_JAR_URL;
    }
    return process.env.TAX_JAR_URL;
}

export function createTaxJarClient(apiKey: string, accountState?: AccountState): Taxjar {
    return new Taxjar({
        apiKey,
        apiUrl: taxJarApiUrlForAccountState(accountState),
    });
}

export async function validateTaxJarApiKey(apiKey: string, accountState?: AccountState): Promise<boolean> {
    if (!apiKey) {
        return false;
    }
    try {
        const client = createTaxJarClient(apiKey, accountState);
        await client.categories();
        return true;
    } catch (error) {
        logger.warn(`TaxJar API key validation failed: ${error}`);
        return false;
    }
}

export function isEuropeanCountry(country?: string): boolean {
    if (!country) {
        return false;
    }
    const normalized = country.toLowerCase();
    return (euCountries as string[]).some((code) => code.toLowerCase() === normalized);
}

export const TAX_JAR_KEY_NOT_SET = 'TaxJar API Key is not set';
export const TAX_JAR_KEY_INVALID = 'TaxJar API key is invalid';
export const INVOICE_TAX_WARNING = 'WARNING Errors occured while generating invoice, invoice still generated';
