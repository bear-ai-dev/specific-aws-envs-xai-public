import { Module } from '@nestjs/common';
import { AgentMeasurementService } from './agent-measurement.service';
import { AgentMeasurementController } from './agent-measurement.controller';
import { InfluxModule } from '../influx/influx.module';

@Module({
    controllers: [AgentMeasurementController],
    providers: [AgentMeasurementService],
    imports: [InfluxModule],
    exports: [AgentMeasurementService],
})
export class AgentMeasurementModule {}
