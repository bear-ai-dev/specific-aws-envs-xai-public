import { ApiHideProperty } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { IsEnum, IsNumberString, IsObject, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { InvoicePaymentTerm } from '../../invoice/entities/invoice.entity';
import { IAMAccessCredentials } from '../../measurement-config/entities/measurement-config.entity';
import { ValidIAMRole } from './customIAMAuthorizer';
import { Type } from 'class-transformer';

export enum TaxCalculationType {
    meteringcoCalculated = 'meteringcoCalculated',
    manual = 'manual',
    none = '',
}
export class CloudIAM {
    @ValidIAMRole('externalId', {
        message: 'Unable to authenticate with the IAM role and External ID provided. Please double check',
    })
    public iamRoleArn: IAMAccessCredentials['iamRoleArn'];

    @IsString()
    @IsOptional()
    public externalId?: IAMAccessCredentials['externalId'];
}

export class UpdateSettingsDto {
    private static readonly logger = new Logger(UpdateSettingsDto.name);

    @IsString()
    @IsOptional()
    public businessName?: string;

    @IsNumberString()
    @IsOptional()
    public taxRate?: string;

    @IsString()
    @IsOptional()
    public addressLine1?: string;

    @IsString()
    @IsOptional()
    public addressLine2?: string;

    @IsString()
    @IsOptional()
    public city?: string;

    @IsString()
    @IsOptional()
    public state?: string;

    @IsString()
    @IsOptional()
    public country?: string;

    @IsString()
    @IsOptional()
    public postalCode?: string;

    @IsString()
    @IsOptional()
    public vatId?: string;

    @IsEnum(InvoicePaymentTerm)
    @IsOptional()
    public invoicePaymentTerm?: InvoicePaymentTerm;

    @IsString()
    @IsOptional()
    public customFields?: string;

    @IsString()
    @IsOptional()
    public logoUrl?: string;

    @IsString()
    @IsOptional()
    public taxCategory?: string;

    @IsString()
    @IsOptional()
    public stripeAccountId?: string;

    @IsEnum(TaxCalculationType)
    @IsOptional()
    public taxCalculationType?: TaxCalculationType;

    /**
     * The businessID associated with your account, not needed for full accounts, this is gathered during authentication
     * @example 'My Cool Corp'
     *
     **/
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;

    @IsOptional()
    @Type(() => CloudIAM)
    @ValidateNested({ each: true })
    public cloudIAM?: CloudIAM;
}
