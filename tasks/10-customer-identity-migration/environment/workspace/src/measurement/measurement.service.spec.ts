import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { MeasurementService } from './measurement.service';

describe('MeasurementService', () => {
    let service: MeasurementService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [MeasurementService],
            imports: [InfluxModule],
        }).compile();

        service = module.get<MeasurementService>(MeasurementService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
