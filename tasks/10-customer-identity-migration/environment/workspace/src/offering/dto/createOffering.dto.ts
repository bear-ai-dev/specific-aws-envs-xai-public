import { Logger } from '@nestjs/common';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';

import { IsNotEmpty, IsOptional, IsString, IsArray, IsEnum, IsUUID, IsNumberString } from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO';
import { OfferingPackageEntity } from '../entities/offeringPackage.entity';

export enum OfferingVisibility {
    private = 'private',
    public = 'public',
}

export enum offeringType {
    'usage-based' = 'usage-based',
    tier = 'tier',
}

export enum validBillingCycles {
    monthly = 'monthly',
}
export enum supportedCurrencies {
    USD = 'USD',
}

/**
 * The Create offering object enables a MeteringCo Client to create an new offering in the MeteringCo System.
 * This can correspond to a pricing tier, a subscription, a flat rate, or pure-usage based
 *
 *
 */
export class CreateOfferingDTO {
    private static readonly logger = new Logger(CreateOfferingDTO.name);

    /**
     *
     * The visibility of the offering, specifically if its private or public.
     * Public offerings are designed to be shared among customers.
     * Private offerings are typically used for enterprise deals which contain discounts or prepaid credits.
     * <br><br>Default: `public`
     *
     * @example "private"
     * @example "public"
     * **/
    @IsEnum(OfferingVisibility)
    @IsNotEmpty()
    @IsOptional()
    @ApiProperty({ enum: OfferingVisibility })
    public offeringVisibility?: OfferingVisibility;

    /**
     * Discount to be applied to the bill of services subscribed to this offering. Only numerical string is allowed.
     * <br><br>Example: `"0.2"` for 20% off.
     *
     * @example "0.2"
     * @example "0.18"
     */
    @IsString()
    @IsOptional()
    public discount?: string;

    /**
     * Prepaid credit amount to be deducted as part of the bill payments. Only numerical string is allowed.
     * <br><br>Example: `"20.00"` for $20.00.
     *
     * @example "20.00"
     */
    @IsNumberString()
    @IsOptional()
    public prepaidCredit?: string;

    /**
     * The type of offering plan.
     * <br>  • `usage-based` - The offering is a pure usage-based offering, or pay-as-you-go. Customer will be billed based on the precise usage of the service.
     * <br>  • `tier` - The offering is a tiered offering, or a subscription. Customer will be billed based on the tier price they are subscribed to.
     * <br><br>Default: `usage-based`
     *
     * @example usage-based
     * @example tier
     */
    @IsEnum(offeringType)
    @IsNotEmpty()
    @IsOptional()
    @ApiProperty({ enum: offeringType })
    public offeringType?: string;

    /**
     * The time frame when an automatic bill should be sent leave empty for no automated billing
     * <br><br>Default: `monthly`
     *
     * @example monthly
     */
    @IsEnum(validBillingCycles)
    @IsOptional()
    public billingCycle?: validBillingCycles;

    /**
     * A friendly, human-readable name for the offering.
     *
     * @example "Entperise Plan"
     */
    @IsString()
    @IsNotEmpty()
    public offeringName: string;

    /**
     * Currently only USD is supported as a currency.
     *
     * @example "USD"
     */
    @IsEnum({ USD: 'USD' })
    @IsOptional()
    @ApiProperty({ enum: supportedCurrencies })
    public currency? = 'USD';

    /**
     * Array of the identifier of the dimensions that this offering contains. Dimensions specify the type of usage that is being billed for.
     *
     * @example ["092f9444-851a-43fb-9503-2228dc01b1b", "4fcafdec-eeb9-4a7f-9caf-61387102b6fa"]
     *
     */
    @IsArray()
    @IsNotEmpty()
    @IsOptional()
    public dimensionIds?: Array<string>;

    /**
     * The Unique ID associated with your specific business account
     *
     * @example myCoolCorp
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;

    constructor(entity: OfferingPackageEntity) {
        if (entity) {
            const {
                offeringName,
                currency,
                offeringType,
                billingCycle,
                dimensionIds,
                discount,
                offeringVisibility,
                prepaidCredit,
            } = entity;
            this.offeringName = offeringName;
            this.currency = currency;
            this.offeringType = offeringType;
            this.billingCycle = billingCycle;
            this.dimensionIds = dimensionIds;
            this.discount = discount;
            this.offeringType = offeringType;
            this.offeringVisibility = offeringVisibility;
            this.prepaidCredit = prepaidCredit;
        }
    }
}

export class CreateOfferingResponse extends BasicResponseDTO {
    /**
     * The identified of the offering.
     * @example "fcb1fa34-8f11-4832-80f2-464cbc7a8546"
     */
    public offeringId: string;
}
