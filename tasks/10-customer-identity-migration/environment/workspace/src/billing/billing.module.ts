import { Module, forwardRef } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrivateAPIServicesModule } from '../services/services.module';
import { PrivateAPIInvoicesModule } from '../invoice/invoices.module';
import { InfluxModule } from '../influx/influx.module';
import { BullModule } from '@nestjs/bull';

@Module({
    providers: [BillingService],
    imports: [
        InfluxModule,
        forwardRef(() => PrivateAPIServicesModule),
        forwardRef(() => PrivateAPIInvoicesModule),
        BullModule.registerQueue({
            name: 'scheduler_billing_queue',
        }),
    ],
})
export class BillingModule {}
