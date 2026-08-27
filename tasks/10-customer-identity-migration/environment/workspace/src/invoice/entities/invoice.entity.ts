import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TaxCalculationType } from '../../setting/dto/update-settings.dto';
import { TaxableLineItem, TaxableLineItems, TaxService } from '../../tax/tax.service';
import fetch from 'cross-fetch';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service';
import { InvoiceInfluxRow } from '../../influx/entities/InvoiceInfluxTable.entity';
import { sendEmail } from '../../utils/aws/ses';
import { CustomerEntity } from '../../customer/entities/customer.entity';
import { PaymentService } from '../../payment/payment.service';
import { supportedCurrencies } from '../../offering/dto/createOffering.dto';
import { ReadSettingsResponseData } from '../../setting/dto/read-setting.dto';
import { default as CountryLookup } from '../../setting/countryLookup.json';
import { default as EUCountryCodes } from '../../setting/euCountries.json';
import { putDocument } from '../../utils/aws/s3';
import { UpdateInvoicesDto } from '../dto/update-invoices.dto';
import { ReadInvoicesDto } from '../dto/read-invoices.dto';
import { SettingsEntity } from '../../setting/entities/settings.entity';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { toDateString } from '../../utils/shared/dateFormating';
import { TaxExempt } from '../../customer/dto/create-customer.dto';
import { AuditService } from '../../audit/audit.service';
import { AuditScope } from '../../audit/entities/audit.interface';

export enum InvoiceStatus {
    DRAFT = 'Draft',
    OPEN = 'Open',
    PAID = 'Paid',
    VOIDED = 'Voided',
}

export class InvoiceLineItem {
    @IsString()
    @IsNotEmpty()
    name: string;
    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    quantity: number;
    @IsNumber()
    @IsNotEmpty()
    unitCost: number;
    @IsString()
    @IsOptional()
    description?: string;

    constructor(name: string, quantity: number, unitCost: number, description?: string) {
        this.name = name;
        this.quantity = quantity;
        this.unitCost = unitCost;
        this.description = description;
    }
    static snakeCaseTransformUnitCost({ unitCost, ...rest }: InvoiceLineItem) {
        return { unit_cost: unitCost, ...rest };
    }
}

export class InvoiceLineItems {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvoiceLineItem)
    private lineItems: InvoiceLineItem[] = [];

    addLineItem(lineItem: InvoiceLineItem) {
        this.lineItems.push(lineItem);
    }

    getLineItems() {
        return this.lineItems;
    }
    getSnakeCaseLineItems() {
        return this.lineItems.map(InvoiceLineItem.snakeCaseTransformUnitCost);
    }
}

export enum InvoicePaymentTerm {
    net30 = '30',
    net60 = '60',
    none = '',
}

export const signedURLGenerator = async (Bucket, Key) => {
    const client = new S3Client({ region: 'us-east-1' });
    const command = new GetObjectCommand({ Bucket, Key });
    const url = await getSignedUrl(client, command, { expiresIn: 604800 });
    return url;
};

class InvalidInvoiceStatusException extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class Invoice {
    public static readonly logger = new Logger(Invoice.name);
    public static readonly _measurement = 'Invoice';
    // Static constants
    private static readonly DEFAULT_REPLYTO_NAME = 'MeteringCo Billing';
    private static readonly DEFAULT_REPLYTO_ADDRESS = 'invoice-delivery-no-reply@meteringco.tech';
    private static readonly DEFAULT_FROM_ADDRESS = 'team@meteringco.tech';
    // Below properties are not stored in DB model
    public fromStreetLine1: string;
    public fromStreetLine2: string;
    public fromCity: string;
    public fromState: string;
    public fromPostalCode: string;
    public fromCountry: string;
    public toStreetLine1: string;
    public toStreetLine2: string;
    public toCity: string;
    public toState: string;
    public toPostalCode: string;
    public toCountry: string;
    public customerName: string;
    public customerEmail: string;
    public defaultTaxRate: string;
    public taxCalculationType: TaxCalculationType;
    public taxCategory: string;
    public taxExempt: TaxExempt;
    public businessName: string;
    public vatId: string;
    public logoUrl: string;
    public invoicePaymentTerm: InvoicePaymentTerm;
    public invoiceLineItems: InvoiceLineItems;
    public influxService: InfluxService = new InfluxService();
    public paymentAPI: PaymentService;
    public paymentChannel: CustomerEntity['paymentChannel'];
    public paymentChannelOptions: CustomerEntity['paymentChannelOptions'];
    public customerVatId: string;
    // Below properties are stored in DB model
    public customerId: string;
    public businessID: string;
    public invoiceId: string;
    public invoiceStatus: InvoiceStatus;
    public invoiceS3bucket: string;
    public invoiceS3key: string;
    public invoiceDate: Date;
    public totalAmountWithoutTax: number;
    public taxAmount: number;

    constructor({
        customerId = '',
        invoiceLineItems = null,
        businessID = '',
        invoiceId = randomUUID(),
        invoiceStatus = InvoiceStatus.DRAFT,
        invoiceS3bucket = '',
        invoiceS3key = '',
        invoiceDate = new Date().toISOString(),
        invoicePaymentTerm = InvoicePaymentTerm.none,
        totalAmountWithoutTax = 0,
        taxAmount = 0,
        paymentAPI,
    }: {
        customerId?: string;
        invoiceLineItems?: InvoiceLineItems;
        businessID: string;
        invoiceId?: string;
        invoiceStatus?: InvoiceStatus;
        invoiceS3bucket?: string;
        invoiceS3key?: string;
        invoiceDate?: string;
        invoicePaymentTerm?: InvoicePaymentTerm;
        totalAmountWithoutTax?: number;
        taxAmount?: number;
        paymentAPI?: PaymentService;
    }) {
        this.customerId = customerId;
        this.invoiceLineItems = invoiceLineItems;
        this.businessID = businessID;
        this.invoiceId = invoiceId;
        this.invoiceStatus = invoiceStatus;
        this.invoiceS3bucket = invoiceS3bucket;
        this.invoiceS3key = invoiceS3key;
        this.invoiceDate = new Date(invoiceDate);
        this.invoicePaymentTerm = invoicePaymentTerm;
        this.paymentAPI = paymentAPI;
        if (totalAmountWithoutTax === 0 && invoiceLineItems && invoiceLineItems.getLineItems().length > 0) {
            this.totalAmountWithoutTax = this.calculateTotalAmountWithoutTax();
        } else {
            this.totalAmountWithoutTax = totalAmountWithoutTax;
        }
        this.taxAmount = taxAmount;
    }

    private calculateTotalAmountWithoutTax(): number {
        let totalAmount = 0;
        this.invoiceLineItems.getLineItems().forEach((lineItem) => {
            totalAmount += lineItem.quantity * lineItem.unitCost;
        });
        return totalAmount;
    }

    public validateStatusUpdate(newInvoiceStatus: InvoiceStatus): boolean {
        Invoice.logger.log(`Validate status update`);
        if (this.invoiceStatus === InvoiceStatus.DRAFT) {
            if (
                newInvoiceStatus === InvoiceStatus.OPEN ||
                newInvoiceStatus === InvoiceStatus.VOIDED ||
                newInvoiceStatus === InvoiceStatus.DRAFT
            ) {
                return true;
            } else {
                return false;
            }
        } else if (this.invoiceStatus === InvoiceStatus.OPEN) {
            if (
                newInvoiceStatus === InvoiceStatus.PAID ||
                newInvoiceStatus === InvoiceStatus.VOIDED ||
                newInvoiceStatus === InvoiceStatus.OPEN
            ) {
                return true;
            } else {
                return false;
            }
        } else if (this.invoiceStatus === InvoiceStatus.PAID) {
            if (newInvoiceStatus === InvoiceStatus.VOIDED || newInvoiceStatus === InvoiceStatus.PAID) {
                return true;
            } else {
                return false;
            }
        } else if (this.invoiceStatus === InvoiceStatus.VOIDED) {
            return true;
        }
        return false;
    }
    private isEuropeanCountry(countryCode: string): boolean {
        return EUCountryCodes.includes(countryCode.toUpperCase());
    }
    public async generate() {
        // prepare invoid
        const businessAddress =
            this.fromStreetLine1 +
            (this.fromStreetLine1 !== '' ? '\n' : '') +
            (this.fromStreetLine2 + (this.fromStreetLine2 !== '' ? '\n' : '')) +
            (this.fromCity + (this.fromCity !== '' ? ', ' : '')) +
            (this.fromState + (this.fromState !== '' ? ' ' : '')) +
            (this.fromPostalCode + (this.fromPostalCode !== '' ? '\n' : '')) +
            (this.fromCountry !== '' ? CountryLookup[this.fromCountry] : '') +
            (this.fromCountry !== '' ? '\n' : '') +
            (this.isEuropeanCountry(this.fromCountry) && this.vatId ? `VAT Registration Number: ${this.vatId}` : '');
        const customerAddress =
            this.toStreetLine1 +
            (this.toStreetLine1 !== '' ? '\n' : '') +
            (this.toStreetLine2 + (this.toStreetLine2 !== '' ? '\n' : '')) +
            (this.toCity + (this.toCity !== '' ? ', ' : '')) +
            (this.toState + (this.toState !== '' ? ' ' : '')) +
            (this.toPostalCode + (this.toPostalCode !== '' ? '\n' : '')) +
            (this.toCountry !== '' ? CountryLookup[this.toCountry] : '') +
            (this.toCountry !== '' ? '\n' : '') +
            (this.isEuropeanCountry(this.toCountry) && this.customerVatId
                ? `VAT Registration Number: ${this.customerVatId}`
                : '');
        const fromEntity =
            this.businessName +
            (this.businessName !== '' ? '\n' : '') +
            (businessAddress + (businessAddress !== '' ? '\n' : ''));
        const toEntity =
            this.customerName +
            (this.customerName !== '' ? '\n' : '') +
            (customerAddress + (customerAddress !== '' ? '\n' : ''));
        if (!this.invoiceDate) {
            this.invoiceDate = new Date();
        }
        let dueDate = null;
        if (
            this.invoicePaymentTerm &&
            (this.invoicePaymentTerm == InvoicePaymentTerm.net30 || this.invoicePaymentTerm == InvoicePaymentTerm.net60)
        ) {
            dueDate = new Date(this.invoiceDate.getTime() + Number(this.invoicePaymentTerm) * 86400000);
        }
        const { rate: salesTaxRate, error } = await this.getSalesTaxRate();
        this.taxAmount = salesTaxRate * this.totalAmountWithoutTax;
        // generate invoice
        const invoicePdf = await Invoice.invoiceAPI({
            from: fromEntity,
            to: toEntity,
            items: this.invoiceLineItems.getSnakeCaseLineItems(),
            invoiceNumber: this.invoiceId,
            dueDate: dueDate ? toDateString(this.invoiceDate) : null,
            invoiceDate: toDateString(this.invoiceDate),
            logoUrl: this.logoUrl,
            tax: salesTaxRate * 100,
        });
        // pdf storage
        this.invoiceS3bucket = `meteringco-${process.env.STAGE}-invoice-bucket`;
        this.invoiceS3key = `${this.businessID}-invoice-${new Date().toISOString()}.pdf`;
        await putDocument(invoicePdf, this.invoiceS3bucket, this.invoiceS3key).done();
        // meta data storage
        await this.saveToDB();

        return {
            invoiceId: this.invoiceId,
            message: error
                ? 'WARNING Errors occured while generating invoice, invoice still generated'
                : 'Generated invoice',
            error,
        };
    }

    public async saveToDB(): Promise<void> {
        const dbModel = this.toDBModel();
        await this.influxService.loadPoints(`${process.env.STAGE}-config`, 'meteringco', dbModel);
    }

    public async updateStatus(newInvoiceStatus: InvoiceStatus): Promise<string> {
        if (this.invoiceStatus == newInvoiceStatus) {
            return 'Invoice already has status ' + newInvoiceStatus;
        } else if (this.validateStatusUpdate(newInvoiceStatus)) {
            if (this.invoiceStatus == InvoiceStatus.DRAFT && newInvoiceStatus == InvoiceStatus.OPEN) {
                const email = await this.draftEmail();
                try {
                    const results = await Promise.allSettled([
                        sendEmail(
                            email.subject,
                            email.fromName,
                            email.fromEmail,
                            email.toEmail,
                            email.content,
                            email.replyToName,
                            email.replyToEmail
                        ),
                        this.paymentAPI.payment({
                            customerId: this.customerId,
                            total: this.totalAmountWithoutTax + this.taxAmount,
                            currency: supportedCurrencies.USD,
                            businessID: this.businessID,
                            paymentChannel: this.paymentChannel,
                            paymentChannelOptions: this.paymentChannelOptions,
                        }),
                    ]);
                    results.forEach((result) => {
                        if (result.status === 'rejected') {
                            AuditService.publishEvent({
                                message: 'Error Occured while processing invoice',
                                topic: AuditScope.ERROR,
                                data: [result],
                            });
                        }
                    });
                } catch (error) {
                    AuditService.publishEvent({
                        message: 'Error Occured while processing invoice',
                        topic: AuditScope.ERROR,
                        data: [error],
                    });
                }
            }
            this.invoiceStatus = newInvoiceStatus;
            await this.saveToDB();
            return 'Invoice status updated to ' + newInvoiceStatus;
        } else {
            throw new InvalidInvoiceStatusException(
                `Invalid invoice status update from ${this.invoiceStatus} to ${newInvoiceStatus}`
            );
        }
    }

    public async generatePresignedUrl(): Promise<string> {
        return await signedURLGenerator(this.invoiceS3bucket, this.invoiceS3key);
    }

    public async draftEmail() {
        const subject = `New invoice from ${this.businessName} #${this.invoiceId}`;
        const downloadLink = await this.generatePresignedUrl();
        const content =
            'Hi,\n\n' +
            'A new invoice from ' +
            this.businessName +
            ' is ready for review. Please review and make the payment for the invoice.\n\n' +
            'Download the invoice from this link:\n' +
            downloadLink +
            '\n' +
            'Note that this link expires after 7 days. Please download the invoice before the link expires.\n\n' +
            'Thanks for your business.\n\nInvoice powered by MeteringCo';
        return {
            subject: subject,
            fromName: this.businessName,
            fromEmail: Invoice.DEFAULT_FROM_ADDRESS,
            toEmail: this.customerEmail,
            content: content,
            replyToName: Invoice.DEFAULT_REPLYTO_NAME,
            replyToEmail: Invoice.DEFAULT_REPLYTO_ADDRESS,
        };
    }

    private async getSalesTaxRate(): Promise<{ rate: number; error?: { message: string } }> {
        Invoice.logger.log('Calculating sales tax');

        if (this.taxExempt === TaxExempt.exempt) {
            return { rate: 0 };
        }
        if (this.taxCalculationType === TaxCalculationType.manual) {
            Invoice.logger.log('Using manual tax rate');
            return { rate: Number(this.defaultTaxRate) };
        } else if (this.taxCalculationType === TaxCalculationType.meteringcoCalculated) {
            Invoice.logger.log('Using meteringco calculated tax rate');
            const taxableLineItems = new TaxableLineItems();
            this.invoiceLineItems.getLineItems().forEach((lineItem) => {
                taxableLineItems.addLineItem(TaxableLineItem.fromInvoiceLineItem(this.taxCategory, lineItem));
            });
            const { rate, error } = await TaxService.calculateSalesTax(
                this.fromCountry,
                this.fromPostalCode,
                this.fromState,
                this.fromCity,
                this.fromStreetLine1,
                this.toCountry,
                this.toPostalCode,
                this.toState,
                this.toCity,
                this.toStreetLine1,
                taxableLineItems
            );
            return { rate, error };
        } else if (this.taxCalculationType === TaxCalculationType.none) {
            Invoice.logger.log('No tax calculation');
            return { rate: 0 };
        }
        return { rate: 0 };
    }

    private static async invoiceAPI({
        from,
        to,
        items,
        invoiceNumber = null, // if null, will be generated
        invoiceDate = null, // if null, will be generated
        dueDate = null, // if null, will be skipped
        logoUrl = null, // if null, will be skipped
        tax = null, // if null, will be skipped
        // amountPaid = null, // placeholder, ignored for now
    }) {
        const payload = {
            from,
            to,
            number: invoiceNumber ? invoiceNumber : randomUUID(),
            logo: logoUrl,
            date: invoiceDate ? invoiceDate : new Date().toISOString(),
            due_date: dueDate,
            items: items,
            fields: { tax: '%', discounts: false, shipping: false },
            tax: tax,
            notes_title: 'Powered by',
            notes: 'MeteringCo',
        };
        const payloadJson = JSON.stringify(payload);
        Invoice.logger.log('Generating invoice with payload', payloadJson);
        const res = await fetch('https://invoice-generator.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payloadJson).toString(),
            },
            body: payloadJson,
        });
        // Validate the results
        if (res.ok) {
            return res.body;
        }
        if (res && typeof res === 'object') {
            Invoice.logger.error(JSON.stringify(res));
            const jsonRes = await res.json();
            Invoice.logger.error(jsonRes);
            Invoice.logger.error(JSON.stringify(res.headers));
        }
        throw new Error('Failed to get Invoice from API');
    }

    public toDBModel(): Array<Point> {
        const invoicePoint = this.influxService.getPoint(Invoice._measurement);
        invoicePoint.tag('businessID', this.businessID);
        invoicePoint.tag('invoiceId', this.invoiceId);
        invoicePoint.tag('invoiceStatus', this.invoiceStatus);
        invoicePoint.tag('invoiceS3bucket', this.invoiceS3bucket);
        invoicePoint.tag('invoiceS3key', this.invoiceS3key);
        invoicePoint.tag('customerId', this.customerId);

        if (this.invoicePaymentTerm) {
            invoicePoint.tag('invoicePaymentTerm', this.invoicePaymentTerm);
        }
        invoicePoint.tag(
            'invoiceLineItems',
            this.invoiceLineItems ? JSON.stringify(this.invoiceLineItems.getLineItems()) : JSON.stringify([])
        );

        invoicePoint.tag('invoiceDate', this.invoiceDate.toISOString());
        invoicePoint.tag('totalAmountWithoutTax', this.totalAmountWithoutTax.toString());
        invoicePoint.tag('taxAmount', this.taxAmount.toString());
        invoicePoint.stringField('invoiceId', this.invoiceId);
        return [invoicePoint];
    }

    public static fromDBModel(dbModel: InvoiceInfluxRow): Invoice {
        const invoiceLineItems = new InvoiceLineItems();
        if (dbModel.invoiceLineItems) {
            const parsed = JSON.parse(dbModel.invoiceLineItems);
            parsed.forEach((item) => {
                invoiceLineItems.addLineItem(
                    new InvoiceLineItem(item.name, item.quantity, item.unitCost, item.description)
                );
            });
        }
        return new Invoice({
            businessID: dbModel.businessID,
            invoiceId: dbModel.invoiceId,
            invoiceStatus: dbModel.invoiceStatus,
            invoiceS3bucket: dbModel.invoiceS3bucket,
            invoiceS3key: dbModel.invoiceS3key,
            customerId: dbModel.customerId,
            invoiceDate: dbModel.invoiceDate,
            totalAmountWithoutTax: Number(dbModel.totalAmountWithoutTax),
            taxAmount: Number(dbModel.taxAmount),
            invoicePaymentTerm: dbModel.invoicePaymentTerm,
            invoiceLineItems: invoiceLineItems,
        });
    }

    public loadPropertiesFromSettingsEntity(settingsEntity: ReadSettingsResponseData): void {
        this.fromStreetLine1 = settingsEntity.addressLine1;
        this.fromStreetLine2 = settingsEntity.addressLine2;
        this.fromCity = settingsEntity.city;
        this.fromState = settingsEntity.state;
        this.fromPostalCode = settingsEntity.postalCode;
        this.fromCountry = settingsEntity.country;
        this.defaultTaxRate = settingsEntity.taxRate;
        this.taxCalculationType = settingsEntity.taxCalculationType;
        this.taxCategory = settingsEntity.taxCategory;
        this.businessName = settingsEntity.businessName;
        this.vatId = settingsEntity.vatId;
        this.logoUrl = settingsEntity.logoUrl;
        if (this.invoicePaymentTerm === InvoicePaymentTerm.none) {
            this.invoicePaymentTerm = settingsEntity.invoicePaymentTerm;
        }
    }

    public loadPropertiesFromCustomerEntity(customerEntity: CustomerEntity): void {
        this.toStreetLine1 = customerEntity.address?.streetLineOne ? customerEntity.address?.streetLineOne : '';
        this.toStreetLine2 = customerEntity.address?.streetLineTwo ? customerEntity.address?.streetLineTwo : '';
        this.toCity = customerEntity.address?.city ? customerEntity.address?.city : '';
        this.toState = customerEntity.address?.state ? customerEntity.address?.state : '';
        this.toPostalCode = customerEntity.address?.postalCode ? customerEntity.address?.postalCode : '';
        this.toCountry = customerEntity.address?.countryCode ? customerEntity.address?.countryCode : '';
        this.customerId = customerEntity.customerId;
        this.customerName = customerEntity.customerName;
        this.customerEmail = customerEntity.email;
        this.paymentChannel = customerEntity.paymentChannel;
        this.paymentChannelOptions = customerEntity.paymentChannelOptions;
        this.customerVatId = customerEntity.customerVatId;
        this.taxExempt = customerEntity.taxExempt;
    }

    public static async handleInvoiceUpdate(
        { invoiceStatus: newStatus, businessID, lineItems, invoiceId, ...rest }: UpdateInvoicesDto,
        currentInvoice: ReadInvoicesDto,
        paymentAPI: PaymentService,
        customerEntity: CustomerEntity,
        settingsEntity: ReadSettingsResponseData
    ): Promise<string> {
        const { invoiceStatus: currentStatus } = currentInvoice;
        if (currentStatus !== InvoiceStatus.DRAFT && Object.keys(rest).length > 0) {
            throw new BadRequestException("Can only update Invoice fields when status is 'DRAFT'");
        }
        if (newStatus && Object.keys(rest).length) {
            throw new BadRequestException('Cannot update Status and Invoice Fields at the same time');
        }
        if (Object.keys(rest).length > 0) {
            const invoiceLineItems = new InvoiceLineItems();
            lineItems.forEach((item) => {
                invoiceLineItems.addLineItem(new InvoiceLineItem(item.name, item.quantity, item.unitCost));
            });
            const updatedInvoice = new Invoice({
                ...currentInvoice,
                invoiceStatus: newStatus,
                invoiceLineItems: invoiceLineItems,
                ...rest,
                businessID,
                paymentAPI: paymentAPI,
                invoiceId,
            });

            updatedInvoice.loadPropertiesFromCustomerEntity(customerEntity);
            updatedInvoice.loadPropertiesFromSettingsEntity(settingsEntity);
            await updatedInvoice.generate();

            return 'Invoice Updated';
        } else {
            const updatedInvoice = new Invoice({
                ...currentInvoice,
                invoiceStatus: currentStatus,
                businessID,
                paymentAPI: paymentAPI,
                invoiceId,
            });
            updatedInvoice.loadPropertiesFromCustomerEntity(customerEntity);
            updatedInvoice.loadPropertiesFromSettingsEntity(settingsEntity);
            const msg = await updatedInvoice.updateStatus(newStatus);
            return msg;
        }
    }
}
