import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrivateAPIServicesModule } from '../services/services.module';
import { forwardRef } from '@nestjs/common';
import { PrivateAPIInvoicesModule } from '../invoice/invoices.module';
import { InfluxModule } from '../influx/influx.module';

describe('BillingService', () => {
    let service: BillingService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [BillingService],
            imports: [
                InfluxModule,
                forwardRef(() => PrivateAPIServicesModule),
                forwardRef(() => PrivateAPIInvoicesModule),
            ],
        }).compile();

        service = module.get<BillingService>(BillingService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
