import { BaseInfluxTable } from './baseInfluxTable.entity';
import {
    ArchiveCostSource,
    ComputeCostSource,
    StorageCostSource,
    TaxCalculationType,
} from '../../setting/dto/update-settings.dto';
import { InvoicePaymentTerm } from '../../invoice/entities/invoice.entity';
import { StripeConnected } from '../../setting/entities/settings.entity';

export class SettingInfluxRow extends BaseInfluxTable {
    public static _measurement = 'Setting';

    public taxRate: string;

    public addressLine1: string;

    public addressLine2: string;

    public city: string;

    public state: string;

    public country: string;

    public postalCode: string;

    public vatId: string;

    public invoicePaymentTerm: InvoicePaymentTerm;

    public customFields: string;

    public logoUrl: string;

    public taxCategory: string;

    public taxCalculationType: TaxCalculationType;

    public businessID: string;

    public stripeAccountId: string;

    public archiveCostSource: ArchiveCostSource;

    public computeCostSource: ComputeCostSource;

    public storageCostSource: StorageCostSource;

    public stripeConnected: StripeConnected;

    public cloudIAM: string;

    public _value: string;

    public _field: string;
}
