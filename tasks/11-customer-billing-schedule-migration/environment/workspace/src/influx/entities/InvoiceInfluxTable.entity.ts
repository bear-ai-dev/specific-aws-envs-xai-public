import { BaseInfluxTable } from './baseInfluxTable.entity';
import { InvoicePaymentTerm, InvoiceStatus } from '../../invoice/entities/invoice.entity';

export class InvoiceInfluxRow extends BaseInfluxTable {
    public static _measurement = 'Invoice';

    public businessID: string;

    public invoiceId: string;

    public invoiceStatus: InvoiceStatus;

    public invoiceS3bucket: string;

    public invoiceS3key: string;

    public invoiceDate: string;

    public totalAmountWithoutTax: number;

    public taxAmount: number;

    public customerId: string;

    public invoicePaymentTerm: InvoicePaymentTerm;

    public invoiceLineItems: string;

    public _value: string;

    public _field: string;
}
