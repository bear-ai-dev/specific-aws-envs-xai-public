import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';

import { InfluxModule } from '../influx/influx.module';
import { UsageModule } from '../usage/usage.module';
import { forwardRef } from '@nestjs/common';
import { PublicAPIOfferingModule } from '../offering/offering.module';
import { PublicAPICustomerModule } from '../customer/customer.module';
import { ServiceIdExistsRule } from './dto/serviceIdExists';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';

@Module({
    providers: [ServicesService, ServiceIdExistsRule],
    imports: [
        forwardRef(() => InfluxModule),
        forwardRef(() => UsageModule),
        forwardRef(() => PublicAPIOfferingModule),
        forwardRef(() => PublicAPICustomerModule),
        forwardRef(() => PublicAPIDimensionsModule),
    ],
    exports: [ServicesService],
})
export class PublicAPIServicesModule {}

@Module({})
export class PrivateAPIServicesModule extends PublicAPIServicesModule {}
