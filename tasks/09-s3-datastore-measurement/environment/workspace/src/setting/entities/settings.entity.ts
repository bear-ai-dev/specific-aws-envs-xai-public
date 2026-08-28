import { Logger } from '@nestjs/common';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { InfluxService } from '../../influx/influx.service';
import { Point } from '@influxdata/influxdb-client';
import { CloudIAM, TaxCalculationType, UpdateSettingsDto } from '../dto/update-settings.dto';
import { SettingInfluxRow } from '../../influx/entities/settingsInfluxTable.entity';
import { InvoicePaymentTerm } from '../../invoice/entities/invoice.entity';

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
    public taxCalculationType: TaxCalculationType;
    @ApiProperty()
    public cloudIAM: CloudIAM;

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
        });
    }
}
