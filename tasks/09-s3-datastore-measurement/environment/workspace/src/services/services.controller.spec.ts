import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { UsageModule } from '../usage/usage.module';
import { PublicAPIServicesController } from './services.controller';
import { forwardRef } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PublicAPIOfferingModule } from '../offering/offering.module';
import { PublicAPICustomerModule } from '../customer/customer.module';

describe('ServicesController', () => {
    let controller: PublicAPIServicesController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PublicAPIServicesController],
            providers: [ServicesService],
            imports: [
                InfluxModule,
                forwardRef(() => UsageModule),
                forwardRef(() => PublicAPIOfferingModule),
                PublicAPICustomerModule,
            ],
        }).compile();

        controller = module.get<PublicAPIServicesController>(PublicAPIServicesController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
