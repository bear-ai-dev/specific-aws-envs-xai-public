import { Module, forwardRef } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';
import { PrivateAPICustomerModule } from '../customer/customer.module';
import { TaxModule } from '../tax/tax.module';
import { PaymentModule } from '../payment/payment.module';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module';
import { UsageModule } from '../usage/usage.module';

@Module({
    controllers: [InvoicesController],
    providers: [InvoicesService],
    imports: [
        forwardRef(() => InfluxModule),
        forwardRef(() => PrivateAPISettingsModule),
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => PaymentModule),
        forwardRef(() => UsageModule),
        forwardRef(() => PrivateAPIDimensionsModule),
        TaxModule,
    ],
    exports: [InvoicesService],
})
export class PrivateAPIInvoicesModule {}
