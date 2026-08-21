import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';
import { TaxService } from './tax.service.js';
import { AccountState } from '../setting/entities/AccountState.js';

export function ValidTaxJarApiKey(validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'validTaxJarApiKey',
            target: (object as { constructor: new (...args: unknown[]) => unknown }).constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                async validate(apiKey: string, args: ValidationArguments) {
                    if (!apiKey) {
                        return true;
                    }
                    try {
                        const accountState = (args.object as { accountState?: AccountState })?.accountState;
                        await TaxService.validateApiKey(apiKey, accountState);
                        return true;
                    } catch (e) {
                        return false;
                    }
                },
                defaultMessage() {
                    return 'TaxJar API key is invalid';
                },
            },
        });
    };
}
