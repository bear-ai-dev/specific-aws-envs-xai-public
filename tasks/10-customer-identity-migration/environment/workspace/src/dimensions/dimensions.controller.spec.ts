import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { PublicAPIDimensionsController } from './dimensions.controller';
import { DimensionsService } from './dimensions.service';
import { forwardRef } from '@nestjs/common';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';
import { PrivateAPIOfferingModule } from '../offering/offering.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

describe('DimensionsController', () => {
    let controller: PublicAPIDimensionsController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PublicAPIDimensionsController],
            providers: [DimensionsService],
            imports: [
                InfluxModule,
                forwardRef(() => MeasurementConfigModule),
                forwardRef(() => PrivateAPIOfferingModule),
                forwardRef(() => PrivateAPIServicesModule),
                forwardRef(() => SchedulerModule),
            ],
        }).compile();

        controller = module.get<PublicAPIDimensionsController>(PublicAPIDimensionsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
