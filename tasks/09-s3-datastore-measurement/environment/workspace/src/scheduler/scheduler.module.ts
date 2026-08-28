import { Module, forwardRef } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { InfluxModule } from '../influx/influx.module';
import { BullModule } from '@nestjs/bull';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';

@Module({
    controllers: [SchedulerController],
    providers: [SchedulerService],
    imports: [
        InfluxModule,
        BullModule.registerQueue({
            name: 'scheduler_queue',
        }),
        BullModule.registerQueue({
            name: 'scheduler_billing_queue',
        }),
    ],
    exports: [SchedulerService],
})
export class SchedulerModule {}
