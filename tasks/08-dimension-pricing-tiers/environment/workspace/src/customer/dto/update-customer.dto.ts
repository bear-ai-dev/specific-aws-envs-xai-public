import { CreateCustomerDto } from './create-customer.dto.js';
import { ApiHideProperty, ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsRFC3339, IsString, ValidationArguments } from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO.js';
import { SupportedCurrencies } from '../../offering/dto/SupportedCurrencies.js';
import { ValidateFutureDate } from './validateFutureDate.js';

export class UpdateCustomerDto extends PartialType(OmitType(CreateCustomerDto, ['offeringEnrollmentDate'] as const)) {
    /**
     * The Unique ID associated with your specific business account
     * @example myCoolCorp
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;

    /**
     * The customer's preferred currency. Only ISO 4217 currency codes are allowed. Overrides the currency on an offering. If not specified,
     * the currency on the offering will be used. If no currency is specified on the offering, the default currency of `"USD"` will be used.
     * Cannot be Updated if a customer has an active balance of credits
     * <br><br>
     * Example `"USD"`
     * @example "USD"
     */
    @IsEnum(SupportedCurrencies, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `currency: The value ${value} is not a valid value for the currency field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsOptional()
    @ApiProperty({ enum: SupportedCurrencies })
    public currency?: SupportedCurrencies;

    /**
     * Free Trial End Date is the date time when a free trial is over for the customer. Must be in the future and a valid RFC 3999 date time.
     * <br><br>
     * Example: `"2199-02-01T11:00:00Z"`
     * @example "2199-02-01T11:00:00Z"
     */
    @IsOptional()
    @IsString()
    @IsRFC3339()
    @ValidateFutureDate('freeTrialEndDate')
    public freeTrialEndDate?: string;
}

export class UpdateCustomerResponseDto extends BasicResponseDTO {
    /**
     * The unique identifier assigned by MeteringCo
     * @example e345f409-daca-4144-91d2-0a0f87c96581
     */
    public customerId: string;

    /**
     * URL to a short-lived Stripe hosted portal session.
     * Customers can be redirected to this URL to enter payment information.
     * Example: `"https://billing.meteringco.com/stripe-portal?customerId=cus_xxxxxxxxxxxxxx"`
     * @example "https://billing.meteringco.com/stripe-portal?customerId=cus_xxxxxxxxxxxxxx"
     */
    public portalUrl?: string;

    /**
     * The human-readable message from the Create Customer API
     * <br><br>
     * Example: `"New customer added"`
     * @example "New customer added"
     * */

    public declare message: 'Customer updated added';
}
