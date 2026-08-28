import { Module, forwardRef } from '@nestjs/common';
import { DimensionsService } from './dimensions.service';
import { PrivateAPIDimensionsController, PublicAPIDimensionsController } from './dimensions.controller';
import { InfluxModule } from '../influx/influx.module';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';
import { PrivateAPIOfferingModule } from '../offering/offering.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { BullModule } from '@nestjs/bull';
import { DimensionIdExistsRule } from './dto/dimensionIdExists';

@Module({
    exports: [DimensionsService],
    controllers: [PublicAPIDimensionsController],
    providers: [DimensionsService, DimensionIdExistsRule],
    imports: [
        InfluxModule,
        forwardRef(() => MeasurementConfigModule),
        forwardRef(() => PrivateAPIOfferingModule),
        forwardRef(() => PrivateAPIServicesModule),
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
        InfluxModule,
        forwardRef(() => MeasurementConfigModule),
        forwardRef(() => PrivateAPIOfferingModule),
        forwardRef(() => PrivateAPIServicesModule),
        forwardRef(() => SchedulerModule),
    ],
})
export class PrivateAPIDimensionsModule extends PublicAPIDimensionsModule {}
