import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { AgentMeasurementService } from './agent-measurement.service';

describe('AgentMeasurementService', () => {
    let service: AgentMeasurementService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [AgentMeasurementService],
            imports: [InfluxModule],
        }).compile();

        service = module.get<AgentMeasurementService>(AgentMeasurementService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
