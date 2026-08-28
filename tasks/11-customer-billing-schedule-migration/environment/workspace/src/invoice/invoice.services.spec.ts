import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrivateAPISettingsModule } from '../setting/settings.module';
import { PrivateAPICustomerModule } from '../customer/customer.module';
import { InfluxModule } from '../influx/influx.module';
import { TaxModule } from '../tax/tax.module';
import { forwardRef } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module';
import { UsageModule } from '../usage/usage.module';

describe('InvoicesService', () => {
    let service: InvoicesService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
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

        service = module.get<InvoicesService>(InvoicesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
