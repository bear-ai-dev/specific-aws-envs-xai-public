import { Injectable } from '@nestjs/common';
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'ManualInvoiceValidationRule', async: false })
@Injectable()
export class ManualInvoiceValidationRule implements ValidatorConstraintInterface {
    validate(lineItems: Array<any>, args: ValidationArguments) {
        if (!lineItems) {
            try {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                if (args?.object?.start || args?.object?.end) {
                    return true;
                }
            } catch (e) {
                console.log(e);
                return false;
            }
        } else {
            if (Array.isArray(lineItems)) {
                return true;
            } else {
                return false;
            }
        }
    }

    defaultMessage() {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return `items must be an Array and if items is not provided start or end must be provided`;
    }
}

export function ManualInvoiceValidation(property: string, validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'ManualInvoiceValidation',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [property],
            options: validationOptions,
            validator: ManualInvoiceValidationRule,
        });
    };
}
