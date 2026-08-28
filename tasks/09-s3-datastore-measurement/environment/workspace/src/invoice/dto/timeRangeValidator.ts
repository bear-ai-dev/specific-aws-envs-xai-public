import { Injectable } from '@nestjs/common';
import {
    ValidationArguments,
    ValidationOptions,
    registerDecorator,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { getFirstDayOfCurrentMonthUTC } from '../../utils/shared/dateFormating';

@ValidatorConstraint({ name: 'StartTimeRangeValidationRule', async: false })
@Injectable()
export class StartTimeRangeValidationRule implements ValidatorConstraintInterface {
    validate(start: string, args: ValidationArguments) {
        if (start) {
            try {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const endTime = args?.object?.end;
                const startTimeDate = new Date(start);
                if (endTime) {
                    const endTimeDate = new Date(endTime);

                    if (
                        startTimeDate.getTime() > endTimeDate.getTime() ||
                        startTimeDate.getTime() === endTimeDate.getTime()
                    ) {
                        return false;
                    }
                } else {
                    const endTimeDate = new Date();
                    if (startTimeDate.getTime() > endTimeDate.getTime()) {
                        return false;
                    }
                }
                return true;
            } catch (e) {
                console.log(e);
                return false;
            }
        } else {
            return true;
        }
    }

    defaultMessage(args: ValidationArguments) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return `start: ${args.object?.start} must be before end: ${
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            args.object?.end ? args.object?.end : new Date().toISOString()
        }`;
    }
}

export function StartTimeRangeValidation(property: string, validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'StartTimeRangeValidation',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [property],
            options: validationOptions,
            validator: StartTimeRangeValidationRule,
        });
    };
}
@ValidatorConstraint({ name: 'EndTimeRangeValidatorRule', async: false })
@Injectable()
export class EndTimeRangeValidatorRule implements ValidatorConstraintInterface {
    validate(endTime: string, args: ValidationArguments) {
        if (endTime) {
            try {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const endTime = args?.object?.end;
                console.log(endTime, 'args endtime');
                const endTimeDate = new Date(endTime);

                const firstDayUTC = getFirstDayOfCurrentMonthUTC();
                if (firstDayUTC.getTime() > endTimeDate.getTime()) {
                    return false;
                } else {
                    return true;
                }
            } catch (e) {
                console.log(e);
                return false;
            }
        } else {
            return true;
        }
    }

    defaultMessage(args: ValidationArguments) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return `end: ${args.object?.end} must be after the first day of the current month if provided`;
    }
}

export function EndTimeRangeValidation(property: string, validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'EndTimeRangeValidation',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [property],
            options: validationOptions,
            validator: EndTimeRangeValidatorRule,
        });
    };
}

@ValidatorConstraint({ name: 'StartTimeBeforeFirstOfMonthRule', async: false })
@Injectable()
export class StartTimeBeforeFirstOfMonthRule implements ValidatorConstraintInterface {
    validate(start: string) {
        if (start) {
            try {
                const startTimeDate = new Date(start);
                const firstDayUTC = getFirstDayOfCurrentMonthUTC();
                if (firstDayUTC.getTime() > startTimeDate.getTime()) {
                    return false;
                } else {
                    return true;
                }
            } catch (e) {
                console.log(e);
                return false;
            }
        } else {
            return true;
        }
    }

    defaultMessage(args: ValidationArguments) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return `start: ${args.object?.start} must be on or after midnight on the first of the current month`;
    }
}
export function StartTimeBeforeFirstOfMonth(property: string, validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'StartTimeBeforeFirstOfMonth',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [property],
            options: validationOptions,
            validator: StartTimeBeforeFirstOfMonthRule,
        });
    };
}
