import { BasicResponseDTO } from '../../basicResponseDTO';
import { SettingsEntity } from '../entities/settings.entity';
import { UpdateSettingsDto } from './update-settings.dto';

export class ReadSettingsResponse extends BasicResponseDTO {
    public data: ReadSettingsResponseData[];
}

export class ReadSettingsResponseData extends UpdateSettingsDto {
    constructor(entity: SettingsEntity) {
        super();
        if (entity) {
            this.businessName = entity.businessName;
            this.taxRate = entity.taxRate;
            this.addressLine1 = entity.addressLine1;
            this.addressLine2 = entity.addressLine2;
            this.city = entity.city;
            this.state = entity.state;
            this.country = entity.country;
            this.postalCode = entity.postalCode;
            this.vatId = entity.vatId;
            this.invoicePaymentTerm = entity.invoicePaymentTerm;
            this.customFields = entity.customFields;
            this.logoUrl = entity.logoUrl;
            this.taxCategory = entity.taxCategory;
            this.taxCalculationType = entity.taxCalculationType;
            this.stripeAccountId = entity.stripeAccountId;
            this.cloudIAM = entity.cloudIAM;
            this.computeCostSource = entity.computeCostSource;
            this.storageCostSource = entity.storageCostSource;
            this.archiveCostSource = entity.archiveCostSource;
            this.stripeConnected = entity.stripeConnected;
        }
    }
}
