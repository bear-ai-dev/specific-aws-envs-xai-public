import { Test, TestingModule } from '@nestjs/testing';
import { forwardRef } from '@nestjs/common';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';
import { InfluxModule } from '../influx/influx.module';
import { MeasurementConfigModule } from '../measurement-config/measurement-config.module';
import { PublicAPIOfferingModule } from '../offering/offering.module';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { PublicAPICustomerModule } from '../customer/customer.module';

describe('UsageController', () => {
    let controller: UsageController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [UsageController],
            providers: [UsageService],
            imports: [
                InfluxModule,
                MeasurementConfigModule,
                PublicAPIDimensionsModule,
                forwardRef(() => PublicAPICustomerModule),
                PublicAPIOfferingModule,
            ],
        }).compile();

        controller = module.get<UsageController>(UsageController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
