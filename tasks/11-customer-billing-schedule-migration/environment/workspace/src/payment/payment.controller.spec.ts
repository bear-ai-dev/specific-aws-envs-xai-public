import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrivateAPICustomerModule } from '../customer/customer.module';
import { forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';

describe('PaymentController', () => {
    let controller: PaymentController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PaymentController],
            providers: [PaymentService],
            imports: [
                forwardRef(() => UsersModule),
                forwardRef(() => PrivateAPICustomerModule),
                forwardRef(() => PrivateAPISettingsModule),
            ],
        }).compile();

        controller = module.get<PaymentController>(PaymentController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
