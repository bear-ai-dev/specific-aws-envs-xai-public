import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service.js';
import { createMock } from '@golevelup/ts-jest';

describe('BillingService', () => {
    let service: BillingService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [BillingService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get<BillingService>(BillingService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
