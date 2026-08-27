import { ApiHideProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum currency {
    usd = 'usd',
}
export class StripePaymentDto {
    /**
     * The unique identifier for the SaaS business
     * @example HarperDB
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID: string;

    /**
     * The amount owed to the saas business
     * @example 1000
     */
    @IsNumber()
    public amount: number;

    /**
     * The currency associated with the stripe
     * @example usd
     */
    @IsEnum(currency)
    public currency: currency;

    /**
     * The customer id, as it appears in stripe
     * @example cust_abc123
     */
    @IsString()
    public customer: string;

    /**
     * The Account ID of the linked business account in stripe
     * @example  ac_1234abc
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public stripeAccountId: string;
}
