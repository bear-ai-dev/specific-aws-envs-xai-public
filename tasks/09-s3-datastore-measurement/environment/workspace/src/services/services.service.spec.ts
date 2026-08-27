import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { UsageModule } from '../usage/usage.module';
import { forwardRef } from '@nestjs/common';

import { ServicesService } from './services.service';
import { PublicAPIOfferingModule } from '../offering/offering.module';
import { PublicAPICustomerModule } from '../customer/customer.module';

describe('ServicesService', () => {
    let service: ServicesService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ServicesService],
            imports: [
                InfluxModule,
                forwardRef(() => UsageModule),
                forwardRef(() => PublicAPIOfferingModule),
                PublicAPICustomerModule,
            ],
        }).compile();

        service = module.get<ServicesService>(ServicesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
