import { Module } from '@nestjs/common';
import { MeasurementService } from './measurement.service';
import { MeasurementController } from './measurement.controller';
import { InfluxModule } from '../influx/influx.module';

@Module({
    controllers: [MeasurementController],
    providers: [MeasurementService],
    imports: [InfluxModule],
    exports: [MeasurementService],
})
export class MeasurementModule {}
