import { IsArray, IsDate, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Invoice, InvoicePaymentTerm, InvoiceStatus } from '../entities/invoice.entity';
import { BasicResponseDTO } from '../../basicResponseDTO';

export class ReadInvoicesDto {
    /**
     * The ID for the Business Entity using MeteringCo
     * @example 123MyCoolCorp980
     */
    @IsString()
    @ApiHideProperty()
    @IsOptional()
    public businessID?: string;

    @IsUUID()
    @ApiHideProperty()
    public invoiceId: string;

    /**
     * The invoice status
     */
    @IsEnum(InvoiceStatus)
    @ApiProperty()
    @IsOptional()
    public invoiceStatus: InvoiceStatus;

    /**
     * The S3 bucket where the invoice is stored
     */
    @IsString()
    @ApiProperty()
    @IsOptional()
    public invoiceS3bucket: string;

    /**
     * The payment term for the invoice
     */
    @IsString()
    @ApiProperty()
    @IsOptional()
    public invoicePaymentTerm: InvoicePaymentTerm;

    /**
     * The S3 key where the invoice is stored
     */
    @IsString()
    @ApiProperty()
    @IsOptional()
    public invoiceS3key: string;

    /**
     * The date the invoice was issued
     */
    @IsDateString()
    @ApiProperty()
    @IsOptional()
    public invoiceDate: string;

    /**
     * The unique identifier assigned by MeteringCo
     */
    @IsUUID()
    @ApiProperty()
    @IsOptional()
    public customerId?: string;

    /**
     * The total amount of the invoice without tax
     */
    @IsNumber()
    @ApiProperty()
    @IsOptional()
    public totalAmountWithoutTax: number;

    /**
     * The total amount of tax on the invoice
     */
    @IsNumber()
    @ApiProperty()
    @IsOptional()
    public taxAmount: number;

    /**
     * The URL to download the invoice
     */
    @IsUrl()
    @ApiProperty()
    @IsOptional()
    public invoiceUrl?: string;

    /**
     * The line items on the invoice
     */
    @IsArray()
    public lineItems: Array<any>;

    constructor(invoice: Invoice, invoiceUrl?: string) {
        this.businessID = invoice.businessID;
        this.invoiceId = invoice.invoiceId;
        this.invoiceStatus = invoice.invoiceStatus;
        this.invoiceS3bucket = invoice.invoiceS3bucket;
        this.invoiceS3key = invoice.invoiceS3key;
        this.invoiceDate = invoice.invoiceDate.toISOString();
        this.customerId = invoice.customerId;
        this.totalAmountWithoutTax = invoice.totalAmountWithoutTax;
        this.taxAmount = invoice.taxAmount;
        if (invoiceUrl) {
            this.invoiceUrl = invoiceUrl;
        }
        if (invoice.invoiceLineItems) {
            this.lineItems = invoice.invoiceLineItems.getLineItems();
        }
        if (invoice.invoicePaymentTerm) {
            this.invoicePaymentTerm = invoice.invoicePaymentTerm;
        }
    }
}

export class ReadInvoicesResponse extends BasicResponseDTO {
    public data: ReadInvoicesDto[];
}
