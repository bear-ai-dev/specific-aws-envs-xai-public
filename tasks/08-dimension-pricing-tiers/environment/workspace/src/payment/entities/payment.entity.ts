import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import EventEmitter from 'events';
import Stripe from 'stripe';
import { CreditService } from '../../credit/credit.service.js';
import { paymentChannel } from '../../customer/dto/create-customer.dto.js';
import { InvoiceStatus } from '../../invoice/entities/InvoiceStatus.js';
import { SupportedCurrencies } from '../../offering/dto/SupportedCurrencies.js';
import { AccountState } from '../../setting/entities/AccountState.js';
import { currency, StripePaymentDto } from '../dto/stripePayment.dto.js';
import { StripePaymentResponseDto } from '../dto/stripePaymentResponse.dto.js';
import { StripeRefundResponseDto } from '../dto/stripeRefundResponse.dto.js';
import { PaymentProcessor, PaymentProcessRequest, PaymentResponse, StripeRefundInput } from './payment.interface.js';
import { CustomerService } from '../../customer/customer.service.js';
import { CustomerCommunicationChannel } from '../../customer/entities/customerCommunication.interface.js';
import { TaxService } from '../../tax/tax.service.js';
import { WebhookProcessorEventType, WebhookPublishingService } from '../../webhook/webhook.service.js';
import { WebhookType } from '../../webhook/dto/create-webhook.dto.js';
import { ReadInvoicesDto } from '../../invoice/dto/read-invoices.dto.js';
import { InfluxService } from '../../influx/influx.service.js';
import { Point } from '@influxdata/influxdb-client';
import { AmountPaidTransaction } from '../dto/createPayment.dto.js';
import { PaymentService } from '../payment.service.js';
import { PaymentTypes } from '../dto/PaymentTypes.js';
import { ReadPaymentDto } from '../dto/readPayment.dto.js';
import { serializeError } from 'serialize-error';
import { AuditScope } from '../../audit/entities/audit.interface.js';
import { AuditService } from '../../audit/audit.service.js';

export class PaymentEntity {
    private eventEmitter: EventEmitter;

    constructor() {
        this.eventEmitter = new EventEmitter();
    }

    publish(paymentProcessRequest: PaymentProcessRequest): PaymentResponse {
        // If there is a credit balance, first
        this.eventEmitter.emit(paymentProcessRequest.topic, paymentProcessRequest);
        return {
            message: 'Payment Event Published',
            id: randomUUID(),
            data: [paymentProcessRequest],
        };
    }
    subscribe(paymentChannel: paymentChannel, processor: PaymentProcessor) {
        this.eventEmitter.on(paymentChannel, processor.process);
    }
}

@Injectable()
export class StripePaymentProcessor extends EventEmitter implements PaymentProcessor {
    private static readonly logger = new Logger(StripePaymentProcessor.name);
    public creditService: CreditService;
    public taxService: TaxService;
    public paymentService: PaymentService;

    async process(paymentProcessRequest: PaymentProcessRequest) {
        try {
            const { paidAmount, chargeResponse } = await this.processPayment(paymentProcessRequest);
            const [{ invoice }] = paymentProcessRequest.data;
            CustomerService.customerCommunicationSystem.publish({
                topic: CustomerCommunicationChannel.EMAIL,
                data: [{ ...(await invoice.draftEmail(paidAmount)), html: true }],
                message: 'Sending email to customer',
            });
            return chargeResponse;
        } catch (e) {
            StripePaymentProcessor.logger.error(
                `Input: ${JSON.stringify(paymentProcessRequest ? paymentProcessRequest : {})})}`,
            );
            StripePaymentProcessor.logger.error(serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to process stripe payment',
                data: [{ error: serializeError(e) }],
            });
        }
    }

    private async processPayment({ data }: PaymentProcessRequest) {
        const [{ invoice, businessID, stripeAccountId, stripeCustomerId, accountState, customerId }] = data;
        const { totalAmountWithoutTax, taxAmount, currency } = invoice;
        if (!stripeAccountId) {
            return { paidAmount: 0 };
        }
        const { balance } = await this.creditService.findCreditBalance({ customerId, businessID });
        const creditBalance = parseFloat(balance);
        let payableTotal = invoice.total;
        invoice.payments = invoice?.payments || [];
        if (creditBalance > 0) {
            const timestamp = new Date().toISOString();
            if (creditBalance >= invoice.total) {
                StripePaymentProcessor.logger.log(
                    `Customer has a credit balance of ${creditBalance} and the invoice total is ${
                        totalAmountWithoutTax + taxAmount
                    }. The customer will be charged with the credit balance and the invoice will be marked as paid.`,
                );
                const { transactionRow } = await this.creditService.create({
                    customerId,
                    businessID,
                    transactionAmount: (invoice.total * -1).toFixed(2),
                    metadata: {
                        invoiceId: invoice.invoiceId,
                        reason: `Payment for ${invoice.invoiceId}`,
                    },
                });
                await this.paymentService.createAmountPaidTransaction({
                    transactionAmount: invoice.total,
                    metadata: {
                        paymentType: PaymentTypes.CREDIT,
                    },
                    invoiceId: invoice.invoiceId,
                    businessID,
                    timestamp,
                    customerId,
                });
                invoice.payments.push(new ReadPaymentDto(transactionRow));
                invoice.amountPaid = invoice.total;
                await StripePaymentProcessor.onSuccess({ data, topic: paymentChannel.Stripe });
                return { paidAmount: invoice.total };
            } else {
                StripePaymentProcessor.logger.log(
                    `Customer has a credit balance of ${creditBalance} and the invoice total is ${
                        totalAmountWithoutTax + taxAmount
                    }. The customer will be charged with the credit balance and the invoice will be marked as partially paid.`,
                );
                const { transactionRow } = await this.creditService.create({
                    customerId,
                    businessID,
                    timestamp,
                    transactionAmount: (creditBalance * -1).toFixed(2),
                    metadata: {
                        invoiceId: invoice.invoiceId,
                        reason: `Payment for ${invoice.invoiceId}`,
                    },
                });
                await this.paymentService.createAmountPaidTransaction({
                    transactionAmount: creditBalance,
                    metadata: {
                        paymentType: PaymentTypes.CREDIT,
                    },
                    invoiceId: invoice.invoiceId,
                    businessID,
                    timestamp,
                    customerId,
                });
                invoice.payments.push(new ReadPaymentDto(transactionRow));
                payableTotal = totalAmountWithoutTax + taxAmount - creditBalance;
            }
        }
        StripePaymentProcessor.logger.log(
            `Creating stripe payment with the following data: amount: ${
                totalAmountWithoutTax + taxAmount
            } currency: ${currency} customer: ${stripeCustomerId} stripeAccountId: ${stripeAccountId}`,
        );
        if (payableTotal) {
            try {
                const paymentIntentResponse: Stripe.Response<Stripe.PaymentIntent> =
                    await StripePaymentProcessor.stripePayment({
                        amount: parseInt(StripePaymentProcessor.calculateStripeTotal(payableTotal).toFixed(0)),
                        currency: currency
                            ? StripePaymentProcessor.convertToStripeCurrency(currency)
                            : StripePaymentProcessor.convertToStripeCurrency(SupportedCurrencies.USD),
                        businessID,
                        stripeCustomerId,
                        stripeAccountId,
                        accountState,
                        invoiceId: invoice.invoiceId,
                    });
                console.log(JSON.stringify(paymentIntentResponse));
                const stripePaidTimestamp = new Date().toISOString();
                await this.paymentService.createAmountPaidTransaction({
                    transactionAmount: payableTotal,
                    metadata: {
                        paymentIntentId: paymentIntentResponse?.id,
                        paymentType: PaymentTypes.STRIPE,
                    },
                    invoiceId: invoice.invoiceId,
                    businessID,
                    timestamp: stripePaidTimestamp,
                    customerId,
                });
                const {
                    amount,
                    id,
                    metadata,
                    currency: stripeCurrency,
                    status,
                    created,
                    charges,
                } = paymentIntentResponse;
                invoice.payments.push(
                    new ReadPaymentDto({
                        amount: amount && amount.toString(),
                        metadata,
                        currency: stripeCurrency,
                        status,
                        created: created && new Date(created).toISOString(),
                        paymentIntentsId: id,
                        charges: charges
                            ? charges.data.map((charge) => {
                                  return {
                                      chargeId: id,
                                      amount: StripePaymentProcessor.convertStripeAmountToMeteringCo(charge.amount),
                                  };
                              })
                            : [],
                    }),
                );

                invoice.amountPaid = invoice.total;
                await StripePaymentProcessor.onSuccess(
                    { data, topic: paymentChannel.Stripe },
                    paymentIntentResponse?.id,
                    this.taxService,
                );
                return { paidAmount: invoice.total, chargeResponse: paymentIntentResponse };
            } catch (error) {
                StripePaymentProcessor.logger.error(serializeError(error));
                await StripePaymentProcessor.onFailure({ data, topic: paymentChannel.Stripe }, error);
                return { paidAmount: invoice.total - payableTotal };
            }
        } else {
            StripePaymentProcessor.logger.log(`Payable total is zero, no payment will be processed`);
            return { paidAmount: 0 };
        }
    }

    static async processStripeRefund({
        amount,
        stripeCustomerId,
        stripeAccountId,
        accountState,
        reason,
        paymentIntentId,
        chargeId,
    }: StripeRefundInput) {
        const stripe = new Stripe(
            accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
            { apiVersion: '2022-08-01' },
        );
        const { metadata } = await stripe.paymentIntents.retrieve(paymentIntentId, { stripeAccount: stripeAccountId });
        const refundResponse = await stripe.refunds.create(
            {
                amount: amount ? StripePaymentProcessor.calculateStripeTotal(parseFloat(amount)) : undefined,
                reason: reason as Stripe.RefundCreateParams.Reason,
                payment_intent: paymentIntentId,
                charge: chargeId,
                metadata: {
                    invoiceId: metadata?.invoiceId,
                },
            },
            { stripeAccount: stripeAccountId },
        );
        const { id } = refundResponse;
        return { refundId: id };
    }
    static async getRefundsForCustomer({
        stripeCustomerId,
        stripeAccountId,
        accountState,
    }): Promise<StripeRefundResponseDto[]> {
        const stripe = new Stripe(
            accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
            { apiVersion: '2022-08-01' },
        );
        let next_page;
        const refundsArray: Stripe.Charge[] = [];
        do {
            const refunds = await stripe.charges.search(
                { query: `customer:\"${stripeCustomerId}\" AND refunded:\"true\"`, limit: 100 },
                { stripeAccount: stripeAccountId },
            );
            if (refunds?.data?.length > 0) {
                refundsArray.push(...refunds.data);
            }

            if (refunds.has_more) {
                next_page = refunds.next_page;
            } else {
                next_page = null;
            }
        } while (next_page);

        do {
            const refunds = await stripe.charges.search(
                { query: `customer:\"${stripeCustomerId}\" AND refunded:\"false\"`, limit: 100 },
                { stripeAccount: stripeAccountId },
            );
            if (refunds?.data?.length > 0) {
                refundsArray.push(...refunds.data);
            }

            if (refunds.has_more) {
                next_page = refunds.next_page;
            } else {
                next_page = null;
            }
        } while (next_page);
        // Determine if we need to paginate the stripe search api response
        return refundsArray.map(({ amount_refunded, amount, id, metadata, currency, status, created }) => ({
            amountRefunded: StripePaymentProcessor.convertStripeAmountToMeteringCo(amount_refunded),
            amount: StripePaymentProcessor.convertStripeAmountToMeteringCo(amount),
            chargeId: id,
            metadata,
            currency,
            status,
            created: created ? new Date(created * 1000).toISOString() : undefined,
        }));
    }
    static convertStripeAmountToMeteringCo(amount: number): string {
        return (amount / 100).toFixed(2);
    }
    static async getPaymentsForCustomer({
        stripeCustomerId,
        stripeAccountId,
        accountState,
        metadata,
    }: {
        stripeCustomerId: string;
        stripeAccountId: string;
        accountState: AccountState;
        metadata?: { invoiceId: string };
    }): Promise<StripePaymentResponseDto[]> {
        StripePaymentProcessor.logger.debug(
            `Starting execution for getting payments for customer ${stripeCustomerId}, metadata: ${JSON.stringify(
                metadata ? metadata : {},
            )}`,
        );
        const stripe = new Stripe(
            accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
            { apiVersion: '2022-08-01' },
        );
        let next_page;
        const paymentsArray: Stripe.PaymentIntent[] = [];
        let query;
        StripePaymentProcessor.logger.debug(`metadata invoiceId: ${metadata?.invoiceId}`);
        if (metadata && metadata.invoiceId) {
            query = `customer:"${stripeCustomerId}" AND metadata[\'invoiceId\']:\'${metadata.invoiceId}\'`;
        } else {
            query = `customer:"${stripeCustomerId}"`;
        }
        StripePaymentProcessor.logger.debug(`query: ${query}`);
        do {
            const payments = await stripe.paymentIntents.search(
                { query: `customer:"${stripeCustomerId}"`, limit: 100 },
                { stripeAccount: stripeAccountId },
            );
            paymentsArray.push(...payments.data);

            if (payments.has_more) {
                next_page = payments.next_page;
            } else {
                next_page = null;
            }
        } while (next_page);
        // Determine if we need to paginate the stripe search api response
        return paymentsArray.map(({ amount, id, metadata, currency, charges, status, created }) => ({
            amount: StripePaymentProcessor.convertStripeAmountToMeteringCo(amount),
            paymentIntentsId: id,
            metadata,
            currency,
            charges: charges
                ? charges.data.map(({ id, amount: chargeAmount }) => ({
                      chargeId: id,
                      amount: StripePaymentProcessor.convertStripeAmountToMeteringCo(chargeAmount),
                  }))
                : [],
            status,
            created: created ? new Date(created * 1000).toISOString() : undefined,
        }));
    }
    static async onSuccess(paymentRequest: PaymentProcessRequest, paymentIntentId?: string, taxService?: TaxService) {
        StripePaymentProcessor.logger.log('Payment was successful');
        // Update Invoice Status to Paid
        const {
            data: [{ invoice, businessID }],
        } = paymentRequest;
        invoice.invoiceStatus = InvoiceStatus.PAID;
        await invoice.saveToDB();
        WebhookPublishingService.publishEvent({
            topic: WebhookProcessorEventType.Standard,
            type: WebhookType.INVOICE_PAID,
            data: [new ReadInvoicesDto(invoice)],
            businessID,
        });
        if (taxService) {
            await invoice.registerInvoiceTaxTransaction({ taxService: taxService, taxTransactionId: paymentIntentId });
        }
    }

    static async onFailure(paymentRequest: PaymentProcessRequest, error) {
        StripePaymentProcessor.logger.warn(
            `Payment was unsuccessful: InvoiceId: ${paymentRequest?.data[0]?.invoice?.invoiceId}  BusinessId: ${paymentRequest?.data[0]?.businessID} customerId: ${paymentRequest?.data[0]?.stripeCustomerId} stripeAccountId: ${paymentRequest?.data[0]?.stripeAccountId}`,
        );
        StripePaymentProcessor.logger.error(error);
    }
    static convertToStripeCurrency(argumentCurrency: SupportedCurrencies) {
        if (argumentCurrency === SupportedCurrencies.USD) {
            return currency.usd;
        }
        if (argumentCurrency === SupportedCurrencies.EUR) {
            return currency.eur;
        } else {
            throw new Error('Currency not supported');
        }
    }
    static calculateStripeTotal(payableTotal: number) {
        return payableTotal * 100; // Convert to cents
    }

    public static async stripePayment({
        amount,
        currency,
        stripeCustomerId,
        stripeAccountId,
        accountState,
        invoiceId,
    }: StripePaymentDto): Promise<Stripe.Response<Stripe.PaymentIntent>> {
        const stripe = new Stripe(
            accountState === AccountState.production ? process.env.PROD_STRIPE_TOKEN : process.env.STRIPE_TOKEN,
            { apiVersion: '2022-08-01' },
        );
        const paymentMethods = await stripe.customers.listPaymentMethods(
            stripeCustomerId,
            {
                type: 'card',
            },
            { stripeAccount: stripeAccountId },
        );
        let customerPaymentMethod;
        if (paymentMethods) {
            const { data } = paymentMethods;
            if (data.length) {
                customerPaymentMethod = data[0].id;
            }
        }
        const charge = await stripe.paymentIntents.create(
            {
                amount,
                currency,
                customer: stripeCustomerId,
                payment_method: customerPaymentMethod,
                confirm: true,
                metadata: {
                    invoiceId: invoiceId ? invoiceId : undefined,
                    processedByMeteringCo: 'true',
                },
            },
            {
                stripeAccount: stripeAccountId,
            },
        );

        return charge;
    }
}

export class ManualPaymentProcessor extends EventEmitter implements PaymentProcessor {
    private static readonly logger = new Logger(ManualPaymentProcessor.name);
    public paymentService: PaymentService;
    async process(paymentRequest: PaymentProcessRequest) {
        try {
            const [{ invoice, businessID, customerId }] = paymentRequest.data;
            if (invoice?.invoiceStatus === InvoiceStatus.PAID) {
                await this.paymentService.createAmountPaidTransaction({
                    transactionAmount: invoice.total,
                    metadata: {
                        paymentType: PaymentTypes.MANUAL,
                    },
                    invoiceId: invoice.invoiceId,
                    businessID,
                    timestamp: new Date().toISOString(),
                    customerId,
                });
                await invoice.saveToDB();
                WebhookPublishingService.publishEvent({
                    topic: WebhookProcessorEventType.Standard,
                    type: WebhookType.INVOICE_PAID,
                    data: [new ReadInvoicesDto(invoice)],
                    businessID,
                });
                await invoice.generatePDFforInvoice({
                    fromEntity: invoice.fromEntity,
                    toEntity: invoice.toEntity,
                    regenerateInvoicePdf: true,
                    paidAmount: invoice.total,
                });
            }
            if (invoice?.invoiceStatus === InvoiceStatus.OPEN) {
                CustomerService.customerCommunicationSystem.publish({
                    topic: CustomerCommunicationChannel.EMAIL,
                    data: [{ ...(await invoice.draftEmail(0)), html: true }],
                    message: 'Sending email to customer',
                });
            }
        } catch (e) {
            ManualPaymentProcessor.logger.error(`Input: ${JSON.stringify(paymentRequest ? paymentRequest : {})})}`);
            ManualPaymentProcessor.logger.error(serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to process manual payment',
                data: [{ error: serializeError(e) }],
            });
        }
    }
}

export class AmountPaidLedgerEntity {
    public static _measurement = 'amountLedgerPaid';
    public businessID: string;
    public invoiceId: string;
    public customerId: string;
    public transactionAmount: number;
    public timestamp: Date;
    public metadata: Record<string, string>;

    constructor({ invoiceId, transactionAmount, timestamp, metadata, businessID, customerId }: AmountPaidTransaction) {
        this.invoiceId = invoiceId;
        this.transactionAmount = transactionAmount;
        this.timestamp = timestamp ? new Date(timestamp) : new Date();
        this.metadata = metadata;
        this.businessID = businessID;
        this.customerId = customerId;
    }

    public static transform(amountPaidLedgerEntity: AmountPaidLedgerEntity, influxService: InfluxService): Point[] {
        const amountPaidLedgerPoint = influxService.getPoint(AmountPaidLedgerEntity._measurement);

        amountPaidLedgerPoint.tag('invoiceId', amountPaidLedgerEntity.invoiceId);
        amountPaidLedgerPoint.tag('customerId', amountPaidLedgerEntity.customerId);
        amountPaidLedgerPoint.tag('businessID', amountPaidLedgerEntity.businessID);
        amountPaidLedgerPoint.floatField('transactionAmount', amountPaidLedgerEntity.transactionAmount);
        if (amountPaidLedgerEntity?.metadata) {
            Object.keys(amountPaidLedgerEntity.metadata).forEach((key) => {
                amountPaidLedgerPoint.tag(`metadata_${key}`, amountPaidLedgerEntity.metadata[key]);
            });
        }
        amountPaidLedgerPoint.timestamp(amountPaidLedgerEntity.timestamp);
        return [amountPaidLedgerPoint];
    }

    public static async getAmountPaidLedger({
        influxService,
        invoiceId,
        businessID,
    }: {
        influxService: InfluxService;
        invoiceId: string;
        businessID: string;
    }): Promise<AmountPaidLedgerEntity[]> {
        const results = await influxService.getAmountPaidLedger({ invoiceId, businessID });

        return results
            .map((result) => {
                const {
                    _time,
                    _value,
                    invoiceId: resultInvoiceId,
                    businessID: resultBusinessID,
                    customerId,
                    ...rest
                } = result;
                const metadata = Object.keys(rest)
                    .filter((key) => /metadata_/.test(key))
                    .reduce((acc, key) => {
                        if (key.split('metadata_')[1] !== '') {
                            acc[key.split('metadata_')[1]] = rest[key];
                        }
                        return acc;
                    }, {});
                return new AmountPaidLedgerEntity({
                    timestamp: _time,
                    transactionAmount: _value,
                    invoiceId: resultInvoiceId,
                    businessID: resultBusinessID,
                    customerId,
                    metadata,
                });
            })
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    public static async sumLedgerAmountPaidByInvoiceId({
        invoiceId,
        businessID,
        influxService,
    }: {
        invoiceId: string;
        businessID: string;
        influxService: InfluxService;
    }): Promise<number> {
        const results = await influxService.sumAmountPaidLedger({ invoiceId, businessID });

        return results.length ? parseFloat(results[0]._value.toFixed(2)) : 0;
    }
    public static async sumLedgerAmountPaidByCustomerId({
        customerId,
        businessID,
        influxService,
    }: {
        customerId: string;
        businessID: string;
        influxService: InfluxService;
    }): Promise<Record<string, number>> {
        const results = await influxService.sumAmountPaidLedgerbyCustomerId({ customerId, businessID });
        // return an object where the key is the invoiceId, and the value is the amount paid
        return results.reduce((acc, result) => {
            acc[result?.invoiceId] = parseFloat(result._value.toFixed(2));
            return acc;
        }, {});
    }
}
