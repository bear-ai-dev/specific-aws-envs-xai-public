import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { AccountState } from '../entities/AccountState.js';
import { TaxCalculationType } from './TaxCalculationType.js';
import { validateTaxJarApiKey } from '../../invoice/tax.js';

export function ValidTaxJarApiKey(validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'validTaxJarApiKey',
            target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
            propertyName,
            options: validationOptions,
            validator: {
                async validate(value: string, args: ValidationArguments) {
                    const target = args.object as {
                        taxJarApiKey?: string;
                        taxCalculationType?: TaxCalculationType;
                        accountState?: AccountState;
                    };
                    const apiKey = propertyName === 'taxJarApiKey' ? value : target.taxJarApiKey;
                    if (target.taxCalculationType === TaxCalculationType.meteringcoCalculated && !apiKey) {
                        return false;
                    }
                    if (propertyName === 'taxJarApiKey' && apiKey) {
                        return validateTaxJarApiKey(apiKey, target.accountState);
                    }
                    return true;
                },
                defaultMessage() {
                    return 'TaxJar API key is invalid or missing for destination tax calculation';
                },
            },
        });
    };
}
