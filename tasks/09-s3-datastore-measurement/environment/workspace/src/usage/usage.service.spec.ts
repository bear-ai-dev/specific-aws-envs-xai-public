import { Test, TestingModule } from '@nestjs/testing';
import { forwardRef } from '@nestjs/common';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';
import { InfluxModule } from '../influx/influx.module';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';
import { PublicAPIOfferingModule } from '../offering/offering.module';
import { PublicAPIServicesModule } from '../services/services.module';
import { UsageService } from './usage.service';

describe('UsageService', () => {
    let service: UsageService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [UsageService],
            imports: [
                InfluxModule,
                MeasurementConfigModule,
                PublicAPIDimensionsModule,
                forwardRef(() => PublicAPIServicesModule),
                PublicAPIOfferingModule,
            ],
        }).compile();

        service = module.get<UsageService>(UsageService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
