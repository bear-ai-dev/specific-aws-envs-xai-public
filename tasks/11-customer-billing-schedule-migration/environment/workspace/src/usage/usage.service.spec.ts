import { Test, TestingModule } from '@nestjs/testing';
import { forwardRef } from '@nestjs/common';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';
import { InfluxModule } from '../influx/influx.module';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';
import { PublicAPIOfferingModule } from '../offering/offering.module';
import { UsageService } from './usage.service';
import { PublicAPICustomerModule } from '../customer/customer.module';

describe('UsageService', () => {
    let service: UsageService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [UsageService],
            imports: [
                InfluxModule,
                MeasurementConfigModule,
                PublicAPIDimensionsModule,
                forwardRef(() => PublicAPICustomerModule),
                PublicAPIOfferingModule,
            ],
        }).compile();

        service = module.get<UsageService>(UsageService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
