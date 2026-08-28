import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Validate,
    ValidateNested,
    ValidationArguments,
} from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO';
import { Type } from 'class-transformer';
import { CustomCountryCodeValidator } from './customCountryCodeValidator';
import { ValidPaymentChannelCustomer } from './stripeCustomerValidator';

export class Address {
    /**
     * Two-letter country code
     * <br><br>
     * Example: <br>
     * - `'US'`<br>
     * - `'DE'`<br>
     */
    @IsNotEmpty()
    @IsString()
    @Validate(CustomCountryCodeValidator)
    @ApiProperty()
    public countryCode: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public postalCode: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public city: string;

    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public streetLineOne: string;

    @IsOptional()
    @IsString()
    @ApiProperty()
    public streetLineTwo?: string;

    /**
     * Two-letter state code
     * <br><br>
     * Example: <br>
     * - `'NY'`
     * - `'CA'`
     */
    @IsNotEmpty()
    @IsString()
    @ApiProperty()
    public state: string;
}

export enum paymentChannel {
    /**
     * Stripe as the payment channel
     */
    Stripe = 'Stripe',
    /**
     * Deprecated
     */
    manual = 'manual',
}
export enum TaxExempt {
    /**
     * Tax exempt
     */
    exempt = 'exempt',
    /**
     * Not tax exempt
     */
    none = 'none',
}
/**
 * Stripe payment channel options
 * @example {"stripeCustomerId": "12345"}
 */
export class StripePaymentChannelOptions {
    @IsOptional()
    stripeCustomerId?: string;
}
export class CreateCustomerDto {
    /**
     * Unique identifier assigned by MeteringCo
     *
     * Example: `"e345f409-daca-4144-91d2-0a0f87c96581"`
     */
    @ApiHideProperty()
    @IsString()
    @IsUUID()
    @IsOptional()
    public customerId?: string;

    /**
     * The friendly, human-readable name for the customer profile
     */
    @IsString()
    @IsNotEmpty()
    public customerName: string;

    /**
     * The VAT ID of the customer.
     * Every VAT identification number must begin with the code of the country concerned and
     * followed by a block of digits or characters.
     * <br><br>
     * Example `"GB VAT 123456789"`
     */
    @IsString()
    @IsOptional()
    public customerVatId?: string;

    /**
     * Customer email address
     */
    @IsEmail()
    @IsOptional()
    public email: string;

    /**
     * The payment channel associated with a customer
     */
    @IsEnum(paymentChannel, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `paymentChannel: The value ${value} is not a valid value for the paymentChannel field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsNotEmpty()
    @ValidPaymentChannelCustomer('paymentChannelOptions', {
        message: 'Stripe payment channel requires a stripeCustomerId under paymentChannelOptions',
    })
    public paymentChannel: paymentChannel;

    /**
     * Whether the customer is exempt from paying taxes
     *
     * Default: `"none"`
     */
    @IsEnum(TaxExempt, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `taxExempt: The value ${value} is not a valid value for the taxExempt field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsOptional()
    public taxExempt?: TaxExempt;

    /**
     * The unique identifier for the SaaS business
     * @example HarperDB
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;

    /**
     * Configuration options for the payment channel.
     * For Stripe payment, `stripeCustomerId` is required.
     * See example below.
     * <br><br>
     * Example `{"stripeCustomerId": "acct-xxxxxxxxxxxxxx"}`
     */
    @IsObject()
    @IsOptional()
    public paymentChannelOptions?: StripePaymentChannelOptions;

    /**
     * The address of the customer
     */
    @ValidateNested({ each: true })
    @IsOptional()
    @Type(() => Address)
    public address?: Address;
}

export class CreateCustomerResponseDto extends BasicResponseDTO {
    /**
     * The unique identifier assigned by MeteringCo
     * @example e345f409-daca-4144-91d2-0a0f87c96581
     */
    public customerId: string;
}
