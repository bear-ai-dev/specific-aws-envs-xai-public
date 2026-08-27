import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { MeasurementConfigService } from './measurement-config.service';
import { MeasurementConfigController } from './measurement-config.controller';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module';
import { StandardMeasurementEntity } from './entities/standardMeasurement.entity';
import { InfluxService } from '../influx/influx.service';

@Module({
    controllers: [MeasurementConfigController],
    providers: [MeasurementConfigService],
    imports: [forwardRef(() => InfluxModule), forwardRef(() => PrivateAPIDimensionsModule)],
    exports: [MeasurementConfigService],
})
export class MeasurementConfigModule implements OnModuleInit {
    constructor(private influxService: InfluxService) {}
    onModuleInit() {
        StandardMeasurementEntity.subscribe(this.influxService);
    }
}
