import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { TaxAuthority } from '../../tax/taxAuthority.js';
import { AccountState } from '../entities/AccountState.js';
import { TaxCalculationType } from './TaxCalculationType.js';

export function ValidTaxJarApiKey(validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'validTaxJarApiKey',
            target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                async validate(taxJarApiKey: unknown, args: ValidationArguments) {
                    const host = args.object as {
                        taxJarApiKey?: string;
                        taxCalculationType?: TaxCalculationType;
                        accountState?: AccountState;
                    };
                    const key = typeof taxJarApiKey === 'string' ? taxJarApiKey : host.taxJarApiKey;
                    if (!key) {
                        if (host.taxCalculationType === TaxCalculationType.meteringcoCalculated) {
                            return false;
                        }
                        return true;
                    }
                    return TaxAuthority.validateApiKey(key, host.accountState);
                },
                defaultMessage(args: ValidationArguments) {
                    const host = args.object as {
                        taxJarApiKey?: string;
                        taxCalculationType?: TaxCalculationType;
                    };
                    if (!host.taxJarApiKey && host.taxCalculationType === TaxCalculationType.meteringcoCalculated) {
                        return 'TaxJar API Key is not set';
                    }
                    return 'TaxJar API key is invalid';
                },
            },
        });
    };
}
