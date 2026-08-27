import { Point } from '@influxdata/influxdb-client';
import { Logger } from '@nestjs/common';
import { ApiHideProperty, ApiProperty, OmitType } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';
import Stripe from 'stripe';
import { InfluxService } from '../../influx/influx.service.js';
import { ReadInvoicesDto } from '../../invoice/dto/read-invoices.dto.js';
import { Invoice } from '../../invoice/entities/invoice.entity.js';
import { InvoiceStatus } from '../../invoice/entities/InvoiceStatus.js';
import { ReadOfferingResponseData } from '../../offering/dto/readOffering.dto.js';
import { SupportedCurrencies } from '../../offering/dto/SupportedCurrencies.js';
import { Offering } from '../../offering/entities/offeringPackage.entity.js';
import { AccountState } from '../../setting/entities/AccountState.js';
import { toDateString } from '../../utils/shared/dateFormating.js';
import { Address, StripePaymentChannelOptions, paymentChannel } from '../dto/create-customer.dto.js';
import { TaxExempt } from '../dto/TaxExempt.js';
import { sleep } from '../../utils/shared/utils.js';
import { paymentChannel as PaymentChannel } from '../dto/create-customer.dto.js';
import { CustomerContractDiscount } from '../../contract/dto/customerContractDiscount.js';
import { ReadContractResponseDto } from '../../contract/dto/readContract.dto.js';
import { CustomerInfluxRow } from '../../influx/entities/customerInfluxRow.js';

export class CustomerEntity {
    private static readonly logger = new Logger(CustomerEntity.name);

    @ApiHideProperty()
    public static _measurement = 'CustomerConfig';

    /**
     * Unique identifier assigned by MeteringCo
     * <br><br>
     * Example: `"e345f409-daca-4144-91d2-0a0f87c96581"`
     */
    public customerId: string;

    @ApiHideProperty()
    public businessID?: string;

    /**
     * The friendly, human-readable name of the customer
     */
    public customerName: string;

    /**
     * The payment channel associated with a customer
     */
    public paymentChannel: paymentChannel;

    /**
     * Customer email address
     * <br><br>
     * Example: `"noreply@meteringco.tech"`
     * @example "noreply@meteringco.tech"
     */
    @IsEmail()
    @IsOptional()
    public email?: string;

    /**
     * Configuration options for the payment channel.
     * For Stripe payment, `stripeCustomerId` is required.
     * See example below.
     * <br><br>
     * Example `{"stripeCustomerId": "acct-xxxxxxxxxxxxxx"}`
     */
    public paymentChannelOptions?: StripePaymentChannelOptions;

    /**
     * Soft deletes a customer from the system.
     * @example true
     */
    @ApiHideProperty()
    public softDelete?: boolean;

    /**
     * The address of the customer
     *  */
    public address?: Address;

    /**
     * The VAT ID of the customer.
     * Every VAT identification number must begin with the code of the country concerned and
     * followed by a block of digits or characters.
     * <br><br>
     * Example `"GB VAT 123456789"`
     * @example "GB VAT 123456789"
     */
    public customerVatId?: string;

    /**
     * Whether the customer is exempt from paying taxes
     * <br><br>
     * Example `"exempt"`
     * @example "exempt"
     */
    @ApiProperty({ default: TaxExempt.none, enum: TaxExempt })
    public taxExempt?: TaxExempt;

    /**
     * The unique identifier of the offering associated with a customer
     * @example "e345f409-daca-4144-91d2-0a0f87c96581"
     */

    public offeringId?: string;

    /**
     * The amount of credit in the customers' account
     * <br><br>
     * Example `"100"`
     * @example "100"
     */

    public creditBalance?: string;

    /**
     *
     * The end date of the free trial for the offering. This is calculated from the current date and the free trial length.
     * <br><br>
     * Example `"2020-12-31T23:59:59.999Z"`
     * @example "2020-12-31T23:59:59.999Z"
     */
    public freeTrialEndDate?: string;

    /**
     *
     * The date time when a customer enrolled for an offering.
     * <br><br>
     * Example `"2020-12-30T23:59:59.999Z"`
     * @example "2020-12-30T23:59:59.999Z"
     */
    public offeringEnrollmentDate?: string;

    /**
     *
     * The start date of the free trial for the offering. This is determined when the customer is enrolled in the offering.
     * <br><br>
     * Example `"2020-12-28T23:59:59.999Z"`
     * @example "2020-12-28T23:59:59.999Z"
     */
    public freeTrialStartDate?: string;

    /**
     * The currency of the customer
     * <br><br>
     * Example `"USD"`
     * @example "USD"
     * */
    public currency?: SupportedCurrencies;

    public metadata?: Record<string, string | number | null>;

    constructor({
        customerId,
        businessID = undefined,
        customerName,
        softDelete = undefined,
        paymentChannel,
        paymentChannelOptions,
        email = '',
        address,
        customerVatId,
        taxExempt = TaxExempt.none,
        offeringId,
        freeTrialEndDate,
        currency,
        creditBalance,
        freeTrialStartDate,
        offeringEnrollmentDate,
        metadata,
    }: CustomerEntity) {
        this.customerId = customerId;
        this.customerName = customerName;
        this.businessID = businessID;
        this.softDelete = softDelete;
        this.paymentChannel = paymentChannel;
        this.paymentChannelOptions = paymentChannelOptions;
        this.email = email;
        this.address = address;
        this.customerVatId = customerVatId;
        this.taxExempt = taxExempt;
        this.offeringId = offeringId;
        this.freeTrialEndDate = freeTrialEndDate;
        this.currency = currency;
        this.creditBalance = creditBalance;
        this.freeTrialStartDate = freeTrialStartDate;
        this.offeringEnrollmentDate = offeringEnrollmentDate;
        this.metadata = metadata;
    }
    static transformer(customerEntity: CustomerEntity, influxService: InfluxService): Array<Point> {
        const customerEntityPoint = influxService.getPoint(CustomerEntity._measurement);

        customerEntityPoint.tag('customerId', customerEntity.customerId);
        customerEntityPoint.tag('businessID', customerEntity.businessID);
        customerEntityPoint.tag('paymentChannel', customerEntity.paymentChannel);
        customerEntityPoint.tag('customerVatId', customerEntity.customerVatId);
        customerEntityPoint.tag('taxExempt', customerEntity.taxExempt);
        customerEntityPoint.tag('email', customerEntity.email);
        customerEntityPoint.stringField('customerName', customerEntity.customerName);
        if (customerEntity.address) {
            customerEntityPoint.tag('address', JSON.stringify(customerEntity.address));
        }
        if (customerEntity.offeringId) {
            customerEntityPoint.tag('offeringId', customerEntity.offeringId);
        }
        if (customerEntity.offeringEnrollmentDate) {
            customerEntityPoint.tag('offeringEnrollmentDate', customerEntity.offeringEnrollmentDate);
        }
        if (customerEntity.paymentChannelOptions) {
            Object.keys(customerEntity.paymentChannelOptions).forEach((key) => {
                customerEntityPoint.tag(`paymentChannelOptions_${key}`, customerEntity.paymentChannelOptions[key]);
            });
        }
        if (customerEntity.softDelete) {
            customerEntityPoint.tag('softDelete', 'deleted');
        }
        if (customerEntity.freeTrialEndDate) {
            customerEntityPoint.tag('freeTrialEndDate', customerEntity.freeTrialEndDate);
        }
        if (customerEntity.freeTrialStartDate) {
            customerEntityPoint.tag('freeTrialStartDate', customerEntity.freeTrialStartDate);
        }
        if (customerEntity.currency) {
            customerEntityPoint.tag('currency', customerEntity.currency);
        }
        if (customerEntity.creditBalance) {
            customerEntityPoint.tag('creditBalance', customerEntity.creditBalance);
        }
        if (customerEntity?.metadata) {
            customerEntityPoint.tag('metadata', JSON.stringify(customerEntity?.metadata));
        }
        // All Entity Transformers should return an array of points, keep logic consistent, even if there is only one element
        return [customerEntityPoint];
    }

    static dbModelToEntity(dbModel: CustomerInfluxRow) {
        const {
            _value,
            customerId,
            paymentChannel,
            email,
            address,
            customerVatId,
            taxExempt,
            offeringId,
            freeTrialEndDate,
            currency,
            creditBalance,
            freeTrialStartDate,
            offeringEnrollmentDate,
            metadata,
            businessID,
            ...rest
        } = dbModel;

        const paymentChannelOptions = Object.keys(rest)
            .filter((key) => /paymentChannelOptions_/.test(key))
            .reduce((acc, key) => {
                acc[key.split('paymentChannelOptions_')[1]] = rest[key];
                return acc;
            }, {}) as CustomerEntity['paymentChannelOptions'];
        return new CustomerEntity({
            email,
            customerName: _value,
            customerId,
            paymentChannel: paymentChannel ? paymentChannel : PaymentChannel.manual,
            paymentChannelOptions,
            address: address ? JSON.parse(address) : {},
            customerVatId,
            taxExempt,
            offeringId,
            freeTrialEndDate,
            currency,
            creditBalance,
            freeTrialStartDate,
            offeringEnrollmentDate,
            metadata: metadata ? JSON.parse(metadata) : undefined,
            businessID,
        });
    }
    static shouldCreateStripeCustomer({
        oldCustomerPaymentChannel = undefined,
        newCustomerPaymentChannel,
        newPaymentChannelOptions,
    }: {
        oldCustomerPaymentChannel?: paymentChannel;
        newCustomerPaymentChannel: paymentChannel;
        newPaymentChannelOptions: StripePaymentChannelOptions;
    }): boolean {
        return (
            (!oldCustomerPaymentChannel || oldCustomerPaymentChannel === paymentChannel.manual) &&
            newCustomerPaymentChannel === paymentChannel.Stripe &&
            (!newPaymentChannelOptions?.stripeCustomerId || newPaymentChannelOptions?.stripeCustomerId === '')
        );
    }
    static async createStripeCustomer({
        email,
        customerName,
        businessStripeAccount,
        accountState,
    }: {
        accountState: AccountState;
        email: string;
        customerName: string;
        businessStripeAccount: string;
    }): Promise<{ portalUrl: string; stripeCustomerId: string }> {
        let portalUrl = undefined;
        let newStripeCustomerId = undefined;

        const stripe = new Stripe(
            accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
            { apiVersion: '2022-08-01' },
        );

        const customerObj = await stripe.customers.create(
            {
                name: customerName,
                email,
            },
            { stripeAccount: businessStripeAccount },
        );
        if (customerObj) {
            ({ id: newStripeCustomerId } = customerObj);
            await sleep(2000);
            const portalSession = await stripe.billingPortal.sessions.create(
                {
                    customer: newStripeCustomerId,
                },
                { stripeAccount: businessStripeAccount },
            );
            if (portalSession) {
                ({ url: portalUrl } = portalSession);
            }
        }

        return { portalUrl, stripeCustomerId: newStripeCustomerId };
    }

    static async getStripeCustomer(
        stripeCustomerId: string,
        businessStripeAccount: string,
        accountState: string,
    ): Promise<Stripe.Customer> {
        const stripe = new Stripe(
            accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
            { apiVersion: '2022-08-01' },
        );

        const customerObj = (await stripe.customers.retrieve(stripeCustomerId, {
            stripeAccount: businessStripeAccount,
        })) as Stripe.Customer;

        return customerObj;
    }

    static async getStripeCustomerPortalUrl(stripeCustomerId, businessStripeAccount, accountState): Promise<string> {
        const stripe = new Stripe(
            accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
            { apiVersion: '2022-08-01' },
        );

        const portalSession = await stripe.billingPortal.sessions.create(
            {
                customer: stripeCustomerId,
            },
            { stripeAccount: businessStripeAccount },
        );

        if (!portalSession) {
            throw new Error('Failed to create portal session');
        }

        return portalSession.url;
    }

    static async stripeCustomerPaymentInfoComplete(customerObj: Stripe.Customer): Promise<boolean> {
        return (
            customerObj !== undefined &&
            customerObj !== null &&
            ((customerObj.default_source !== undefined && customerObj.default_source !== null) ||
                (customerObj.invoice_settings?.default_payment_method !== undefined &&
                    customerObj.invoice_settings?.default_payment_method !== null))
        );
    }
}

export class CustomerInvoiceMetadata extends OmitType(ReadInvoicesDto, ['customerId'] as const) {
    @ApiProperty({
        enum: InvoiceStatus,
        externalDocs: {
            url: 'https://docs.meteringco.tech/invoice-and-process-payment/issue-invoice',
            description: 'See Invoice Life Cycle section for more details',
        },
    })
    public invoiceStatus: InvoiceStatus;
    constructor(invoice: Invoice) {
        // I am not sure why but this super call doesn't appear to set "this" or call the ReadInvoicesDto constructor
        // TODO: Investigate why this is happening
        super(invoice);
        this.invoiceId = invoice.invoiceId;
        this.invoiceStatus = invoice.invoiceStatus;
        this.invoiceDate = toDateString(invoice.invoiceDate);
        this.totalAmountWithoutTax = invoice.totalAmountWithoutTax;
        this.taxAmount = invoice.taxAmount;
        if (invoice.invoiceLineItems) {
            this.lineItems = invoice.invoiceLineItems.getLineItems().map((lineItem) => ({
                ...lineItem,
                unitCost: ReadInvoicesDto.cutoffDigits(lineItem.unitCost),
                quantity: ReadInvoicesDto.cutoffDigits(lineItem.quantity),
            }));
        }
        this.invoicePaymentTerm = invoice.invoicePaymentTerm;
        this.currency = invoice.currency;
    }
}
export class ReadCustomerResponseData extends CustomerEntity {
    /**
     * Array of invoices associated with a customer
     */
    @ApiProperty({ type: CustomerInvoiceMetadata, isArray: true, minItems: 0 })
    public invoices?: CustomerInvoiceMetadata[];

    /**
     * The offering associated with a customer
     */
    public offering: ReadOfferingResponseData;

    /**
     * Whether the customer's Stripe account has complete payment information
     * This property is only set if the customer's payment channel is Stripe
     * <br><br>
     * Example `true`
     * @example true
     */
    @ApiProperty({ type: Boolean, required: false })
    public stripeAccountReady?: boolean;
    /**
     * The specific customer level discount. This is the discount that is applied to the customer's overall bill.
     */
    @ApiProperty({ type: CustomerContractDiscount, isArray: false })
    public discount?: CustomerContractDiscount;

    constructor(
        customer: CustomerEntity,
        invoices: CustomerInvoiceMetadata[] = null,
        contract?: ReadContractResponseDto,
        stripeAccountReady: boolean = undefined,
    ) {
        super({
            ...customer,
            currency: Offering.getCurrency({ offering: contract?.readOfferingResponseData, customer }),
        });
        this.invoices = invoices;
        this.offering = contract?.readOfferingResponseData;
        this.stripeAccountReady = stripeAccountReady;
        if (contract && contract?.overridesForOffering && contract?.overridesForOffering?.discount) {
            this.discount = contract?.overridesForOffering?.discount;
        }
        delete this.businessID;
    }
}

export class ReadAllCustomersResponseData extends ReadCustomerResponseData {}
