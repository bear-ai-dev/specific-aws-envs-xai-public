import { Logger } from '@nestjs/common';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { InfluxService } from '../../influx/influx.service';
import { Point } from '@influxdata/influxdb-client';
import {
    ArchiveCostSource,
    CloudIAM,
    ComputeCostSource,
    StorageCostSource,
    UpdateSettingsDto,
} from '../dto/update-settings.dto';
import { TaxCalculationType } from '../dto/TaxCalculationType';
import { SettingInfluxRow } from '../../influx/entities/settingsInfluxTable.entity';
import { InvoicePaymentTerm } from '../../invoice/entities/invoice.entity';

export enum StripeConnected {
    connected = 'connected',
    notConnected = 'notConnected',
}

export class SettingsEntity {
    private static readonly logger = new Logger(SettingsEntity.name);
    @ApiHideProperty()
    public static _measurement = 'Setting';
    @ApiProperty()
    public businessName: string;
    @ApiProperty()
    public taxRate: string;
    @ApiHideProperty()
    public businessID: string;
    @ApiProperty()
    public addressLine1: string;
    @ApiProperty()
    public addressLine2: string;
    @ApiProperty()
    public city: string;
    @ApiProperty()
    public state: string;
    @ApiProperty()
    public country: string;
    @ApiProperty()
    public postalCode: string;
    @ApiProperty()
    public vatId: string;
    @ApiProperty()
    public invoicePaymentTerm: InvoicePaymentTerm;
    @ApiProperty()
    public customFields: string;
    @ApiProperty()
    public logoUrl: string;
    @ApiProperty()
    public taxCategory: string;
    @ApiProperty()
    public stripeAccountId: string;
    @ApiProperty()
    public stripeConnected: StripeConnected;
    @ApiProperty()
    public taxCalculationType: TaxCalculationType;
    @ApiProperty()
    public cloudIAM: CloudIAM;
    @ApiProperty()
    public computeCostSource: ComputeCostSource;
    @ApiProperty()
    public storageCostSource: StorageCostSource;
    @ApiProperty()
    public archiveCostSource: ArchiveCostSource;

    constructor({
        businessName = '',
        taxRate = '',
        addressLine1 = '',
        addressLine2 = '',
        city = '',
        state = '',
        country = '',
        postalCode = '',
        vatId = '',
        invoicePaymentTerm = InvoicePaymentTerm.none,
        customFields = '',
        logoUrl = '',
        taxCategory = '',
        taxCalculationType = TaxCalculationType.none,
        businessID,
        stripeAccountId,
        cloudIAM,
        computeCostSource = ComputeCostSource.none,
        storageCostSource = StorageCostSource.none,
        archiveCostSource = ArchiveCostSource.none,
        stripeConnected,
    }: UpdateSettingsDto) {
        this.businessName = businessName;
        this.taxRate = taxRate;
        this.addressLine1 = addressLine1;
        this.addressLine2 = addressLine2;
        this.city = city;
        this.state = state;
        this.country = country;
        this.postalCode = postalCode;
        this.vatId = vatId;
        this.invoicePaymentTerm = invoicePaymentTerm;
        this.customFields = customFields;
        this.logoUrl = logoUrl;
        this.taxCategory = taxCategory;
        this.taxCalculationType = taxCalculationType;
        this.businessID = businessID;
        this.stripeAccountId = stripeAccountId;
        this.cloudIAM = cloudIAM;
        this.computeCostSource = computeCostSource;
        this.storageCostSource = storageCostSource;
        this.archiveCostSource = archiveCostSource;
        this.stripeConnected = stripeConnected;
    }

    static transformer(settingsEntity: SettingsEntity, influxService: InfluxService): Array<Point> {
        const settingPoint = influxService.getPoint(SettingsEntity._measurement);

        const {
            businessID,
            businessName,
            taxRate,
            addressLine1,
            addressLine2,
            city,
            state,
            country,
            postalCode,
            vatId,
            invoicePaymentTerm,
            customFields,
            logoUrl,
            taxCategory,
            taxCalculationType,
            stripeAccountId,
            cloudIAM,
            computeCostSource,
            storageCostSource,
            archiveCostSource,
            stripeConnected,
        } = settingsEntity;

        settingPoint.tag('businessID', businessID);
        settingPoint.stringField('businessName', businessName);
        settingPoint.tag('taxRate', taxRate);
        settingPoint.tag('addressLine1', addressLine1);
        settingPoint.tag('addressLine2', addressLine2);
        settingPoint.tag('city', city);
        settingPoint.tag('state', state);
        settingPoint.tag('country', country);
        settingPoint.tag('postalCode', postalCode);
        settingPoint.tag('vatId', vatId);
        settingPoint.tag('invoicePaymentTerm', invoicePaymentTerm);
        settingPoint.tag('customFields', customFields);
        settingPoint.tag('logoUrl', logoUrl);
        settingPoint.tag('taxCategory', taxCategory);
        settingPoint.tag('taxCalculationType', taxCalculationType);
        settingPoint.tag('stripeAccountId', stripeAccountId);
        settingPoint.tag('computeCostSource', computeCostSource);
        settingPoint.tag('storageCostSource', storageCostSource);
        settingPoint.tag('archiveCostSource', archiveCostSource);
        settingPoint.tag('stripeConnected', stripeConnected);
        if (cloudIAM) {
            settingPoint.tag('cloudIAM', JSON.stringify(cloudIAM));
        }
        // All Entity Transformers should return an array of points, keep logic consistent, even if there is only one element
        return [settingPoint];
    }

    static dbModelToEntity(dbModel: SettingInfluxRow): SettingsEntity {
        const {
            _value: businessName,
            taxRate = '',
            businessID = '',
            addressLine1 = '',
            addressLine2 = '',
            city = '',
            state = '',
            country = '',
            postalCode = '',
            vatId = '',
            invoicePaymentTerm = InvoicePaymentTerm.none,
            customFields = '',
            logoUrl = '',
            taxCategory = '',
            taxCalculationType = TaxCalculationType.none,
            stripeAccountId = '',
            cloudIAM = '{}',
            computeCostSource = ComputeCostSource.none,
            storageCostSource = StorageCostSource.none,
            archiveCostSource = ArchiveCostSource.none,
            stripeConnected = StripeConnected.notConnected,
        } = dbModel;

        return new SettingsEntity({
            businessName,
            taxRate,
            addressLine1,
            addressLine2,
            city,
            state,
            country,
            postalCode,
            vatId,
            invoicePaymentTerm,
            customFields,
            logoUrl,
            businessID,
            taxCategory,
            taxCalculationType,
            stripeAccountId,
            cloudIAM: cloudIAM ? JSON.parse(cloudIAM) : {},
            computeCostSource,
            storageCostSource,
            archiveCostSource,
            stripeConnected,
        });
    }
}
