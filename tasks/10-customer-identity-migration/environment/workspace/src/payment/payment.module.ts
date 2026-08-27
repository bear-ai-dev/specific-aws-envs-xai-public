import { Module, forwardRef } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PrivateAPICustomerModule } from '../customer/customer.module';
import { UsersModule } from '../users/users.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';

@Module({
    controllers: [PaymentController],
    providers: [PaymentService],
    imports: [
        forwardRef(() => UsersModule),
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => PrivateAPISettingsModule),
    ],
    exports: [PaymentService],
})
export class PaymentModule {}
