import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { AgentMeasurementController } from './agent-measurement.controller';
import { AgentMeasurementService } from './agent-measurement.service';

describe('AgentMeasurementController', () => {
    let controller: AgentMeasurementController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AgentMeasurementController],
            providers: [AgentMeasurementService],
            imports: [InfluxModule],
        }).compile();

        controller = module.get<AgentMeasurementController>(AgentMeasurementController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
