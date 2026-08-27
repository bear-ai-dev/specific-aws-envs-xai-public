import { ApiHideProperty } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import {
    IsEnum,
    IsNumberString,
    IsObject,
    IsOptional,
    IsString,
    IsUrl,
    ValidateNested,
    ValidationArguments,
} from 'class-validator';
import { InvoicePaymentTerm } from '../../invoice/entities/invoice.entity';
import { IAMAccessCredentials } from '../../measurement-config/entities/measurement-config.entity';
import { ValidIAMRole } from './customIAMAuthorizer';
import { Type } from 'class-transformer';
import { StripeConnected } from '../entities/settings.entity';

export enum TaxCalculationType {
    meteringcoCalculated = 'meteringcoCalculated',
    manual = 'manual',
    none = '',
}

export enum ComputeCostSource {
    eks = 'eks',
    none = 'none',
}
export enum StorageCostSource {
    ebs = 'ebs',
    none = 'none',
}
export enum ArchiveCostSource {
    ebs = 'ebs',
    none = 'none',
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

    @IsOptional()
    @ApiHideProperty()
    public stripeConnected?: StripeConnected;

    @IsString()
    @IsOptional()
    public vatId?: string;

    @IsEnum(InvoicePaymentTerm, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `invoicePaymentTerm: The value ${value} is not a valid value for the invoicePaymentTerm field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
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

    @IsEnum(TaxCalculationType, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `taxCalculationType: The value ${value} is not a valid value for the taxCalculationType field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
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

    /**
     * The compute cost source for your account, this enables MeteringCo to calculate your compute costs so as to determine unit costs and usage based costs.
     * The default is 'none'
     * @example 'ec2'
     * @default 'none'
     * @type {ComputeCostSource}
     */
    @IsOptional()
    @IsEnum(ComputeCostSource, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `computeCostSource: The value ${value} is not a valid value for the computeCostSource field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    public computeCostSource?: ComputeCostSource;

    /**
     * The storage cost source for your account, this enables MeteringCo to calculate your storage costs so as to determine unit costs and usage based costs.
     * The default is 'none'
     * @example 'ebs'
     * @default 'none'
     * @type {StorageCostSource}
     **/
    @IsOptional()
    @IsEnum(StorageCostSource, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `storageCostSource: The value ${value} is not a valid value for the storageCostSource field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    public storageCostSource?: StorageCostSource;

    /**
     * The archive cost source for your account, this enables MeteringCo to calculate your archive costs so as to determine unit costs and usage based costs.
     * The default is 'none'
     * @example 'ebs'
     * @default 'none'
     * @type {ArchiveCostSource}
     * */
    @IsOptional()
    @IsEnum(ArchiveCostSource, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `archiveCostSource: The value ${value} is not a valid value for the archiveCostSource field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    public archiveCostSource?: ArchiveCostSource;
}
