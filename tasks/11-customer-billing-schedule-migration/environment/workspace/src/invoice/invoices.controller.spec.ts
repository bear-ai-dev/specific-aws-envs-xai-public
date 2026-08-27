import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PrivateAPISettingsModule } from '../setting/settings.module';
import { PrivateAPICustomerModule } from '../customer/customer.module';
import { TaxModule } from '../tax/tax.module';
import { InfluxModule } from '../influx/influx.module';
import { forwardRef } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module';
import { UsageModule } from '../usage/usage.module';

describe('InvoicesController', () => {
    let controller: InvoicesController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [InvoicesController],
            providers: [InvoicesService],
            imports: [
                InfluxModule,
                PrivateAPISettingsModule,
                forwardRef(() => PrivateAPICustomerModule),
                forwardRef(() => PaymentModule),
                forwardRef(() => UsageModule),
                forwardRef(() => PrivateAPIDimensionsModule),
                TaxModule,
            ],
        }).compile();

        controller = module.get<InvoicesController>(InvoicesController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
