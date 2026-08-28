import { ApiHideProperty } from '@nestjs/swagger';
import { Stripe } from 'stripe';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO';

export class OnboardingDto {
    /**
     * TThe unique identifier for the SaaS business
     * @example HarperDB
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID: string;

    /**
     *
     * The unique userID
     * @example abcsdkdslfkjalsdkfj
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public subject: string;

    /**
     *
     * If the prior linked account should be overridden.
     * @example true
     */
    @ApiHideProperty()
    @IsBoolean()
    @IsOptional()
    public override: true;
}
export class OnboardingResponseDTO extends BasicResponseDTO {
    /**
     * The data associated with the response, will contain relevant stripe information
     */
    @IsOptional()
    @Length(1, 1)
    data?: Array<StripeConnectAccountResponse>;
}

class StripeConnectAccountResponse {
    /**
     * The URL to be directed to in order to complete the strpe onboarding
     * @example https://connect.stripe.com/wowThisIsreallycool
     */
    public url: Stripe.AccountLink['url'];

    /**
     * The UNIX time when the URL will expire
     * @example 1234567841240
     */
    @IsString()
    public expires: Stripe.AccountLink['expires_at'];
}

export class DeletedStripeAccountAssociationResponse extends BasicResponseDTO {
    /**
     * The ID associated with the stripe account
     * @example acct_12lksdaghdk
     */
    @IsString()
    public id: string;
    /**
     * A boolean value to indicate if association was deleted or not
     * @example true
     */
    @IsString()
    public deleted: boolean;
}
