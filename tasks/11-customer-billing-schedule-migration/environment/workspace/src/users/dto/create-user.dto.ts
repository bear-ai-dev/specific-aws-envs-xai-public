import { IsBoolean, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
    /**
     *The subject associated with the jwt token on the authentication request
     * with Auth0 this is returned in the payload after the authentication process occurs
     * It is apart of the JWT specification and must be globally unique and associated with the JWT bearer
     * @example aabbbcbaksjdhka@clients
     */
    @IsString()
    @IsNotEmpty()
    subject: string;
    /**
     * The business enitity which the subject is tied to, multiple subjects can have the same businessID
     * @example myCoolCorp
     */
    @IsString()
    @IsNotEmpty()
    businessID: string;

    /**
     * If the account is considered a temporary account or not, defaults to false
     * @example true
     */
    @IsBoolean()
    @IsOptional()
    temp?: boolean;

    /**
     * The assocaited stripe account with the user if relevant.
     * @example ac_itkjsadf1
     */
    @IsString()
    @IsOptional()
    stripeAccountID?: string;
    /**
     * The date when the account will expire. After this date, MeteringCo will soft delete the information associated with the account
     * @example 2019-09-07T-15:50+00
     */
    @IsISO8601()
    @IsOptional()
    accountExpiryDate?: string;
}
