import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './payment.service';
import { forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PrivateAPICustomerModule } from '../customer/customer.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';

describe('PaymentService', () => {
    let service: PaymentService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [PaymentService],
            imports: [
                forwardRef(() => UsersModule),
                forwardRef(() => PrivateAPICustomerModule),
                forwardRef(() => PrivateAPISettingsModule),
            ],
        }).compile();

        service = module.get<PaymentService>(PaymentService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
