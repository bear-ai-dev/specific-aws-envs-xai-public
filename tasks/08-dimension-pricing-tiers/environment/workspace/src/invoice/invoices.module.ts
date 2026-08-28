import { Module, forwardRef } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { PrivateInvoicesController, PublicAPIInvoicesController } from './invoices.controller.js';
import { InfluxModule } from '../influx/influx.module.js';
import { PrivateAPISettingsModule } from '../setting/settings.module.js';
import { PrivateAPICustomerModule } from '../customer/customer.module.js';
import { TaxModule } from '../tax/tax.module.js';
import { PaymentModule } from '../payment/payment.module.js';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module.js';
import { UsageModule } from '../usage/usage.module.js';
import { CreditModule } from '../credit/credit.module.js';

@Module({
    controllers: [PublicAPIInvoicesController],
    providers: [InvoicesService],
    imports: [
        forwardRef(() => InfluxModule),
        forwardRef(() => PrivateAPISettingsModule),
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => PaymentModule),
        forwardRef(() => UsageModule),
        forwardRef(() => PrivateAPIDimensionsModule),
        forwardRef(() => TaxModule),
        forwardRef(() => CreditModule),
    ],
    exports: [InvoicesService],
})
export class PublicAPIInvoicesModule {}
@Module({
    controllers: [PrivateInvoicesController],
    providers: [InvoicesService],
    imports: [
        forwardRef(() => InfluxModule),
        forwardRef(() => PrivateAPISettingsModule),
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => PaymentModule),
        forwardRef(() => UsageModule),
        forwardRef(() => PrivateAPIDimensionsModule),
        forwardRef(() => TaxModule),
        forwardRef(() => CreditModule),
    ],
    exports: [InvoicesService],
})
export class PrivateAPIInvoicesModule extends PublicAPIInvoicesModule {}
