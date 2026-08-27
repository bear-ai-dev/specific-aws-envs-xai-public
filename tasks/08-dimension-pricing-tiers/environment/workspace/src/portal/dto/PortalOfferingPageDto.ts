import {
    ArrayMinSize,
    IsArray,
    IsHexColor,
    IsNotEmptyObject,
    IsNumberString,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
    ValidationArguments,
    ValidationOptions,
    registerDecorator,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FeaturedOfferingPortalDto {
    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    text?: string;
    constructor(doc) {
        if (doc) {
            this.text = doc.text;
        }
    }
}

export function OfferingIdCanBeEmptyIfExternalLinkExists(property: string, validationOptions?: ValidationOptions) {
    return function (object: unknown, propertyName: string) {
        registerDecorator({
            name: 'OfferingIdCanBeEmptyIfExternalLinkExists',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [property],
            options: validationOptions,
            validator: {
                async validate(offeringId: any, args: ValidationArguments) {
                    if (offeringId === null || offeringId === undefined || offeringId === '') {
                        try {
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-ignore
                            if (args.object.externalLink) {
                                return true;
                            } else {
                                return false;
                            }
                        } catch (e) {
                            return false;
                        }
                    } else {
                        return true;
                    }
                },
            },
        });
    };
}

export class AppearanceOfferingPortalDto {
    @IsString()
    @IsHexColor()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    borderColor?: string;

    @IsString()
    @IsHexColor()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    background?: string;

    @IsString()
    @IsHexColor()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    ctaBorderColor?: string;

    @IsString()
    @IsHexColor()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    ctaBackground?: string;

    @IsString()
    @IsHexColor()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    textColor?: string;

    @IsString()
    @IsHexColor()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    ctaTextColor?: string;

    @IsString()
    @IsHexColor()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    featureMarkColor?: string;

    @IsNumberString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    borderRadius?: string;
    constructor(doc) {
        if (doc) {
            this.borderColor = doc.borderColor;
            this.background = doc.background;
            this.ctaBorderColor = doc.ctaBorderColor;
            this.ctaBackground = doc.ctaBackground;
            this.textColor = doc.textColor;
            this.ctaTextColor = doc.ctaTextColor;
            this.featureMarkColor = doc.featureMarkColor;
            this.borderRadius = doc.borderRadius;
        }
    }
}
export class CTAOfferingPortalDto {
    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    text: string;

    @OfferingIdCanBeEmptyIfExternalLinkExists('offeringId', {
        message: 'offeringId and externalLink cannot be empty at the same time',
        always: true,
    })
    @ApiProperty({ type: String, required: false })
    offeringId?: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    externalLink?: string;

    constructor(doc) {
        if (doc) {
            this.text = doc.text;
            this.offeringId = doc.offeringId;
            this.externalLink = doc.externalLink;
        }
    }
}
export class PortalOfferingPageDto {
    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    title?: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    subtitle?: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    price?: string;

    @IsOptional()
    @Type(() => FeaturedOfferingPortalDto)
    @ValidateNested()
    @ApiProperty({ type: FeaturedOfferingPortalDto, required: false })
    featured?: FeaturedOfferingPortalDto;

    @IsObject()
    @IsNotEmptyObject()
    @Type(() => CTAOfferingPortalDto)
    @ValidateNested()
    @ApiProperty({ type: CTAOfferingPortalDto, required: true })
    cta: CTAOfferingPortalDto;

    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, required: false })
    description?: string;

    @IsArray()
    @ArrayMinSize(1)
    @ApiProperty({ isArray: true, type: String, required: true })
    features: string[];

    constructor(doc) {
        if (doc) {
            this.title = doc.title;
            this.subtitle = doc.subtitle;
            this.price = doc.price;
            this.featured = new FeaturedOfferingPortalDto(doc.featured);
            this.cta = new CTAOfferingPortalDto(doc.cta);
            this.description = doc.description;
            this.features = doc.features;
        }
    }
}
