import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';
import { SettingsEntity } from '../entities/settings.entity.js';
import { AccountState } from '../entities/AccountState.js';
import { UpdateSettingsDto } from './update-settings.dto.js';

export class ReadSettingsResponse extends BasicResponseDTO {
    public data: ReadSettingsResponseData[];
}

export class ReadSettingsResponseData extends UpdateSettingsDto {
    /**
     * Wether or not the account is a sandbox account. This effects payment and other integrations like tax.
     * <br><br>
     * Example: `"sandbox"`
     * @example "sandbox"
     *
     */
    @ApiProperty({ default: AccountState.production, enum: AccountState })
    public declare accountState?: AccountState;
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
            this.taxJarApiKey = entity.taxJarApiKey;
            this.accountState = entity.accountState;
            this.pages = entity.pages;
            this.invoiceApproval = entity.invoiceApproval;
            this.freeDimensionOnInvoice = entity.freeDimensionOnInvoice;
            this.invoiceGeneration = entity.invoiceGeneration;
            this.supportEmail = entity.supportEmail;
        }
    }
}
