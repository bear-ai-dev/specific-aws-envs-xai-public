import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import {
    PrivateAPIServicesController,
    PublicAPIServicesController as PublicAPIServicesController,
} from './services.controller';
import { InfluxModule } from '../influx/influx.module';
import { UsageModule } from '../usage/usage.module';
import { forwardRef } from '@nestjs/common';
import { PublicAPIOfferingModule } from '../offering/offering.module';
import { PublicAPICustomerModule } from '../customer/customer.module';
import { ServiceIdExistsRule } from './dto/serviceIdExists';
import { PrivateAPIDimensionsModule, PublicAPIDimensionsModule } from '../dimensions/dimensions.module';

@Module({
    controllers: [PublicAPIServicesController],
    providers: [ServicesService, ServiceIdExistsRule],
    imports: [
        InfluxModule,
        forwardRef(() => UsageModule),
        forwardRef(() => PublicAPIOfferingModule),
        forwardRef(() => PublicAPICustomerModule),
        forwardRef(() => PublicAPIDimensionsModule),
    ],
    exports: [ServicesService],
})
export class PublicAPIServicesModule {}

@Module({
    controllers: [PrivateAPIServicesController],
})
export class PrivateAPIServicesModule extends PublicAPIServicesModule {}
