import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ServicesService } from '../services/services.service';
import { InfluxService } from '../influx/influx.service';
import { InvoicesService } from '../invoice/invoices.service';
import { Billing, billingScheduleConsumers } from './entities/billing.entity';
import { randomUUID } from 'crypto';
import { Process, Processor } from '@nestjs/bull';
import { CreateBillingReportDto } from './dto/createBillingReport.dto';
import { Job } from 'bull';
import { SchedulerEntity } from '../scheduler/entities/scheduler.entity';

@Processor('scheduler_billing_queue')
export class BillingService {
    private static readonly logger = new Logger(BillingService.name);
    constructor(
        readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => ServicesService)) readonly servicesService: ServicesService,
        @Inject(forwardRef(() => InvoicesService)) readonly invoicesService: InvoicesService
    ) {}
    @Process({ name: billingScheduleConsumers.billingReport })
    async create({ data: { scheduleParameters } }: Job<SchedulerEntity>) {
        const { customerId, businessID } = scheduleParameters as CreateBillingReportDto;
        // 1. Called via the scheduler contains a customerId, and BusinessID, gets set when a customer is created
        // 2, Get all services for the customer
        const { data } = await this.servicesService.findAllServicesWithCustomerId({ customerId, businessID });
        if (data.length) {
            const lineItems = await Billing.generateLineItemsFromServices({
                data,
                influxService: this.InfluxService,
                businessID,
            });
            BillingService.logger.log(`Line Items for billing: ${JSON.stringify(lineItems)}`);
            // 5. Create the Invoice by calling the invoice module and passing the line items (Might need to manually call the email in the invioceModule look into this )
            const { invoiceId } = await this.invoicesService.create({ businessID, customerId, items: lineItems });
            // Should set Invoice to Draft status, actual payment will be handled by the payment module and is done when there is a state change with the invoice status.
            const { startTime, endTime } = Billing.billingCycleToTimeRange(data[0]?.offering.billingCycle);
            const entity = new Billing({
                invoiceId,
                businessID,
                customerId,
                startTime,
                endTime,
                billingId: randomUUID(),
            });
            // 6. Save Billing information to the Ledger
            const point = Billing.transformer(entity, this.InfluxService);
            await this.InfluxService.loadPoints(`${process.env.STAGE}-aggregate-usage`, 'meteringco', [point]);
        } else {
            BillingService.logger.log(`No Billing Data found for customer:${customerId} in business: ${businessID}`);
        }
    }
}
