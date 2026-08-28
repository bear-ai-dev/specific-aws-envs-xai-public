import { BasicResponseDTO } from '../../basicResponseDTO';
import { CustomerEntity } from '../entities/customer.entity';
import { ReadInvoicesDto } from '../../invoice/dto/read-invoices.dto';
import { OmitType } from '@nestjs/swagger';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { toDateString } from '../../utils/shared/dateFormating';

export class CustomerInvoiceMetadata extends OmitType(ReadInvoicesDto, [
    'businessID',
    'customerId',
    'invoiceS3bucket',
    'invoiceS3key',
] as const) {
    constructor(invoice: Invoice) {
        super();
        this.invoiceId = invoice.invoiceId;
        this.invoiceStatus = invoice.invoiceStatus;
        this.invoiceDate = toDateString(invoice.invoiceDate);
        this.totalAmountWithoutTax = invoice.totalAmountWithoutTax;
        this.taxAmount = invoice.taxAmount;
        this.invoicePaymentTerm = invoice.invoicePaymentTerm;
        this.lineItems = invoice.invoiceLineItems.getLineItems();
    }
}

export class ReadCustomerResponseData extends CustomerEntity {
    /**
     * Array of invoices associated with this customer
     */
    public invoices?: CustomerInvoiceMetadata[];
    constructor(customer: CustomerEntity, invoices: CustomerInvoiceMetadata[] = null) {
        super({ ...customer });
        this.invoices = invoices;
    }
}

export class ReadCustomerResponseDTO extends BasicResponseDTO {
    /**
     * Array of customers
     */
    public data: ReadCustomerResponseData[];
}
