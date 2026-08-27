import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { PublicAPICustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { forwardRef } from '@nestjs/common';
import { PrivateAPIServicesModule } from '../services/services.module';
import { PrivateAPIOfferingModule } from '../offering/offering.module';
import { UsageModule } from '../usage/usage.module';

describe('CustomerController', () => {
    let controller: PublicAPICustomerController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PublicAPICustomerController],
            providers: [CustomerService],
            imports: [
                InfluxModule,
                forwardRef(() => SchedulerModule),
                forwardRef(() => PrivateAPIServicesModule),
                forwardRef(() => PrivateAPIOfferingModule),
                forwardRef(() => UsageModule),
            ],
        }).compile();

        controller = module.get<PublicAPICustomerController>(PublicAPICustomerController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
