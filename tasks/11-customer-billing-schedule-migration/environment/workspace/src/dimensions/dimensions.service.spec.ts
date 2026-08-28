import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { DimensionsService } from './dimensions.service';
import { forwardRef } from '@nestjs/common';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';
import { PrivateAPIOfferingModule } from '../offering/offering.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

describe('DimensionsService', () => {
    let service: DimensionsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DimensionsService],
            imports: [
                InfluxModule,
                forwardRef(() => MeasurementConfigModule),
                forwardRef(() => PrivateAPIOfferingModule),
                forwardRef(() => PrivateAPIServicesModule),
                forwardRef(() => SchedulerModule),
            ],
        }).compile();

        service = module.get<DimensionsService>(DimensionsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
