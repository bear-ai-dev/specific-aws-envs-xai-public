import { Module, forwardRef } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { PrivateAPICustomerController, PublicAPICustomerController } from './customer.controller';
import { InfluxModule } from '../influx/influx.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { PrivateAPIOfferingModule } from '../offering/offering.module';
import { CustomerIdExistsRule } from './dto/customerIdExists';
import { UsageModule } from '../usage/usage.module';

@Module({
    controllers: [PublicAPICustomerController],
    providers: [CustomerService, CustomerIdExistsRule],
    imports: [
        forwardRef(() => InfluxModule),
        forwardRef(() => SchedulerModule),
        forwardRef(() => PrivateAPIServicesModule),
        forwardRef(() => PrivateAPIOfferingModule),
        forwardRef(() => UsageModule),
    ],
    exports: [CustomerService],
})
export class PublicAPICustomerModule {}

@Module({
    controllers: [PrivateAPICustomerController],
})
export class PrivateAPICustomerModule extends PublicAPICustomerModule {}
