import { Module, forwardRef } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { PrivateAPICustomerController, PublicAPICustomerController } from './customer.controller';
import { InfluxModule } from '../influx/influx.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { PrivateAPIServicesModule } from '../services/services.module';

@Module({
    controllers: [PublicAPICustomerController],
    providers: [CustomerService],
    imports: [InfluxModule, forwardRef(() => SchedulerModule), forwardRef(() => PrivateAPIServicesModule)],
    exports: [CustomerService],
})
export class PublicAPICustomerModule {}

@Module({
    controllers: [PrivateAPICustomerController],
})
export class PrivateAPICustomerModule extends PublicAPICustomerModule {}
