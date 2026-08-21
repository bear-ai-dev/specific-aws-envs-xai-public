import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import Taxjar from 'taxjar';
import { AccountState } from '../entities/AccountState.js';
import { TaxCalculationType } from './TaxCalculationType.js';

const TAX_JAR_KEY_NOT_SET = 'TaxJar API Key is not set';
const TAX_JAR_KEY_INVALID = 'TaxJar API Key is invalid';

function resolveTaxJarApiUrl(accountState?: AccountState | string): string {
    return accountState === AccountState.production ? process.env.PROD_TAX_JAR_URL : process.env.TAX_JAR_URL;
}

export function createTaxJarClient(apiKey: string, accountState?: AccountState | string): Taxjar {
    return new Taxjar({
        apiKey,
        apiUrl: resolveTaxJarApiUrl(accountState),
    });
}

export async function assertTaxJarApiKey(apiKey: string, accountState?: AccountState | string): Promise<void> {
    if (!apiKey) {
        throw new Error(TAX_JAR_KEY_NOT_SET);
    }
    const client = createTaxJarClient(apiKey, accountState);
    try {
        await client.categories();
    } catch (error) {
        throw new Error(TAX_JAR_KEY_INVALID);
    }
}

export function ValidTaxJarApiKey(validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'validTaxJarApiKey',
            target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
            propertyName,
            options: validationOptions,
            validator: {
                async validate(taxJarApiKey: unknown, args: ValidationArguments) {
                    const key = typeof taxJarApiKey === 'string' ? taxJarApiKey : '';
                    if (!key) {
                        const dto = args.object as { taxCalculationType?: TaxCalculationType };
                        return dto.taxCalculationType !== TaxCalculationType.meteringcoCalculated;
                    }
                    try {
                        const dto = args.object as { accountState?: AccountState };
                        await assertTaxJarApiKey(key, dto.accountState);
                        return true;
                    } catch (error) {
                        return false;
                    }
                },
                defaultMessage(args: ValidationArguments) {
                    const key = typeof args.value === 'string' ? args.value : '';
                    if (!key) {
                        return TAX_JAR_KEY_NOT_SET;
                    }
                    return TAX_JAR_KEY_INVALID;
                },
            },
        });
    };
}
