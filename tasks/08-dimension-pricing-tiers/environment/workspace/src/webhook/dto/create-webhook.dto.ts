import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidationArguments } from 'class-validator';
import { Environment } from '../../users/dto/Environment.js';

export enum WebhookType {
    INVOICE_CREATED = 'INVOICE_CREATED',
    INVOICE_PAID = 'INVOICE_PAID',
    STRIPE_PAYMENT_FAILED = 'STRIPE_PAYMENT_FAILED',
    CUSTOMER_CREATED = 'CUSTOMER_CREATED',
    ENTITLEMENT = 'ENTITLEMENT',
}
export class CreateWebhookDto {
    @IsOptional()
    @ApiHideProperty()
    businessID: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    hookUrl: string;

    @IsEnum(WebhookType)
    @IsNotEmpty()
    webhookType: WebhookType;

    @IsString()
    @IsOptional()
    offeringId?: string;

    /**
     * The environment the webhook is for. This is used to differentiate between sandbox and production. Optional, will default to `production` if not provided.
     * <br/><br/>
     * Example: `"sandbox"`
     * @example "sandbox"
     *
     */
    @ApiProperty()
    @IsEnum(Environment, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `environment: The value ${value} is not a valid value for the environment field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsOptional()
    environment?: string;
}
