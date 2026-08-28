import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { CreditService } from '../credit/credit.service.js';
import { paymentChannel } from '../customer/dto/create-customer.dto.js';
import { TaxService } from '../tax/tax.service.js';
import { AmountPaidLedgerEntity, ManualPaymentProcessor, StripePaymentProcessor } from './entities/payment.entity.js';
import { PaymentProcessRequest } from './entities/payment.interface.js';
import { InfluxService } from '../influx/influx.service.js';
import { AmountPaidTransaction } from './dto/createPayment.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditScope } from '../audit/entities/audit.interface.js';
import { serializeError } from 'serialize-error';
import { AmountPaidLedgerResponse } from './dto/amountPaidLedgerResponse.dto.js';

@Injectable()
export class PaymentService {
    constructor(@Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService) {}
    private static readonly logger = new Logger(PaymentService.name);
    public static stripePaymentProcessor = new StripePaymentProcessor();
    public static manualPaymentProcessor = new ManualPaymentProcessor();

    public static subscribe(creditService: CreditService, taxService: TaxService, paymentService: PaymentService) {
        PaymentService.stripePaymentProcessor.creditService = creditService;
        PaymentService.stripePaymentProcessor.taxService = taxService;
        PaymentService.stripePaymentProcessor.paymentService = paymentService;
        PaymentService.manualPaymentProcessor.paymentService = paymentService;
        PaymentService.stripePaymentProcessor.on(paymentChannel.Stripe, this.stripePaymentProcessor.process);
        PaymentService.manualPaymentProcessor.on(paymentChannel.manual, this.manualPaymentProcessor.process);
    }
    public static publishEvent({ topic, data }: PaymentProcessRequest) {
        PaymentService.logger.log(`Publishing event for ${topic}`);
        if (topic === paymentChannel.Stripe) {
            PaymentService.stripePaymentProcessor.emit(topic, { data });
        }
        if (topic === paymentChannel.manual) {
            PaymentService.manualPaymentProcessor.emit(topic, { data });
        }
    }

    public async getAmountPaid({ invoiceId, businessID }: { invoiceId: string; businessID: string }) {
        PaymentService.logger.log(`amountPaid for ${invoiceId}  in businessID: ${businessID}`);
        try {
            const res = AmountPaidLedgerEntity.sumLedgerAmountPaidByInvoiceId({
                influxService: this.InfluxService,
                invoiceId,
                businessID,
            });
            return res;
        } catch (e) {
            PaymentService.logger.error(
                `amountPaid for ${invoiceId}  in businessID: ${businessID} failed with error ${serializeError(e)}`,
            );
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to get amount paid',
                data: [{ invoiceId, businessID, error: serializeError(e) }],
            });
            throw e;
        }
    }

    async getAmountPaidForCustomerInvoices({ customerId, businessID }: { customerId: string; businessID: string }) {
        PaymentService.logger.log(`amountPaid for  customer: ${customerId}  in businessID: ${businessID}`);
        try {
            const res = await AmountPaidLedgerEntity.sumLedgerAmountPaidByCustomerId({
                influxService: this.InfluxService,
                customerId,
                businessID,
            });
            return res;
        } catch (e) {
            PaymentService.logger.error(
                `amountPaid for  customer: ${customerId}  in businessID: ${businessID} failed with error ${serializeError(
                    e,
                )}`,
            );
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to get amount paid',
                data: [{ customerId, businessID, error: serializeError(e) }],
            });
            throw e;
        }
    }

    public async getPaymentTransactions({
        invoiceId,
        businessID,
    }: {
        invoiceId: string;
        businessID: string;
    }): Promise<AmountPaidLedgerResponse[]> {
        PaymentService.logger.log(`getPaymentTransactions for ${invoiceId}  in businessID: ${businessID}`);
        try {
            const res = await AmountPaidLedgerEntity.getAmountPaidLedger({
                influxService: this.InfluxService,
                invoiceId,
                businessID,
            });
            return res.map((e) => new AmountPaidLedgerResponse(e));
        } catch (e) {
            PaymentService.logger.error(
                `getPaymentTransactions for ${invoiceId}  in businessID: ${businessID} failed with error ${serializeError(
                    e,
                )}`,
            );
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to get payment transactions',
                data: [{ invoiceId, businessID, error: serializeError(e) }],
            });
            throw e;
        }
    }

    public async createAmountPaidTransaction(
        transaction: AmountPaidTransaction,
    ): Promise<{ invoiceId: string; message: string; amountPaidLedgerRow: AmountPaidLedgerResponse }> {
        PaymentService.logger.log(
            `createAmountPaidTransaction for ${transaction?.invoiceId}  in businessID: ${transaction?.businessID}`,
        );
        let amountPaidEntity;
        try {
            amountPaidEntity = new AmountPaidLedgerEntity(transaction);
            const points = AmountPaidLedgerEntity.transform(amountPaidEntity, this.InfluxService);
            await this.InfluxService.loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, points);
        } catch (e) {
            PaymentService.logger.error(
                `createAmountPaidTransaction for ${transaction?.invoiceId}  in businessID: ${transaction?.businessID} failed with error ${serializeError(
                    e,
                )}`,
            );
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to create amount paid transaction',
                data: [{ transaction, error: serializeError(e) }],
            });
            throw e;
        }
        return {
            message: 'Successfully created amount paid transaction',
            invoiceId: transaction.invoiceId,
            amountPaidLedgerRow: new AmountPaidLedgerResponse(amountPaidEntity),
        };
    }
}
