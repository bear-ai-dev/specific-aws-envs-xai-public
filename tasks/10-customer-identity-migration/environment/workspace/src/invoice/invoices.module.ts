import { Module, forwardRef } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';
import { PrivateAPICustomerModule, PublicAPICustomerModule } from '../customer/customer.module';
import { TaxModule } from '../tax/tax.module';
import { PaymentModule } from '../payment/payment.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module';

@Module({
    controllers: [InvoicesController],
    providers: [InvoicesService],
    imports: [
        InfluxModule,
        PrivateAPISettingsModule,
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => PaymentModule),
        forwardRef(() => PrivateAPIServicesModule),
        forwardRef(() => PrivateAPIDimensionsModule),
        TaxModule,
    ],
    exports: [InvoicesService],
})
export class PrivateAPIInvoicesModule {}
