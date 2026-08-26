import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { AccountState } from '../entities/AccountState.js';
import Taxjar from 'taxjar';
import { taxJarApiUrl } from '../../invoice/taxJar.client.js';

async function keyIsAccepted(taxJarApiKey: string, accountState: AccountState): Promise<boolean> {
    try {
        const client = new Taxjar({
            apiKey: taxJarApiKey,
            apiUrl: taxJarApiUrl(accountState),
        });
        await client.categories();
        return true;
    } catch (e) {
        return false;
    }
}

export function ValidTaxJarApiKey(validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'validTaxJarApiKey',
            target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                async validate(taxJarApiKey: any, args: ValidationArguments) {
                    if (!taxJarApiKey) {
                        return true;
                    }
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    const accountState = args.object?.accountState as AccountState | undefined;
                    if (accountState === AccountState.production) {
                        return keyIsAccepted(taxJarApiKey, AccountState.production);
                    }
                    if (accountState === AccountState.sandbox) {
                        return keyIsAccepted(taxJarApiKey, AccountState.sandbox);
                    }
                    if (await keyIsAccepted(taxJarApiKey, AccountState.sandbox)) {
                        return true;
                    }
                    return keyIsAccepted(taxJarApiKey, AccountState.production);
                },
                defaultMessage() {
                    return 'TaxJar API Key is invalid';
                },
            },
        });
    };
}
