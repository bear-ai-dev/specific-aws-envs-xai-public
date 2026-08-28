import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { CustomerService } from './customer.service';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { forwardRef } from '@nestjs/common';
import { PrivateAPIServicesModule } from '../services/services.module';

describe('CustomerService', () => {
    let service: CustomerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [CustomerService],
            imports: [InfluxModule, forwardRef(() => SchedulerModule), forwardRef(() => PrivateAPIServicesModule)],
        }).compile();

        service = module.get<CustomerService>(CustomerService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
