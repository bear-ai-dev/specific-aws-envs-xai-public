import { Module, forwardRef } from '@nestjs/common';
import { DimensionsService } from './dimensions.service.js';
import { PrivateAPIDimensionsController, PublicAPIDimensionsController } from './dimensions.controller.js';
import { InfluxModule } from '../influx/influx.module.js';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module.js';
import { PrivateAPIOfferingModule } from '../offering/offering.module.js';
import { PrivateAPIServicesModule } from '../services/services.module.js';
import { SchedulerModule } from '../scheduler/scheduler.module.js';
import { BullModule } from '@nestjs/bull';
import { DimensionIdExistsRule } from './dto/dimensionIdExists.js';
import { PrivateAPICustomerModule } from '../customer/customer.module.js';

@Module({
    exports: [DimensionsService],
    controllers: [PublicAPIDimensionsController],
    providers: [DimensionsService, DimensionIdExistsRule],
    imports: [
        forwardRef(() => InfluxModule),
        forwardRef(() => MeasurementConfigModule),
        forwardRef(() => PrivateAPIOfferingModule),
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => SchedulerModule),
    ],
})
export class PublicAPIDimensionsModule {}

@Module({
    controllers: [PrivateAPIDimensionsController],
    imports: [
        BullModule.registerQueue({
            name: 'scheduler_queue',
        }),
        forwardRef(() => InfluxModule),
        forwardRef(() => MeasurementConfigModule),
        forwardRef(() => PrivateAPIOfferingModule),
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => SchedulerModule),
    ],
})
export class PrivateAPIDimensionsModule extends PublicAPIDimensionsModule {}
