import { Module, forwardRef, OnModuleInit, Injectable } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { PaymentController } from './payment.controller.js';
import { PrivateAPICustomerModule } from '../customer/customer.module.js';
import { UsersModule } from '../users/users.module.js';
import { PrivateAPISettingsModule } from '../setting/settings.module.js';
import { CreditModule } from '../credit/credit.module.js';
import { PaymentEntity, StripePaymentProcessor } from './entities/payment.entity.js';
import { ModuleRef } from '@nestjs/core';
import { CreditService } from '../credit/credit.service.js';
import { TaxModule } from '../tax/tax.module.js';
import { TaxService } from '../tax/tax.service.js';
import { InfluxModule } from '../influx/influx.module.js';

@Module({
    controllers: [PaymentController],
    providers: [PaymentService, StripePaymentProcessor, PaymentEntity],
    imports: [
        forwardRef(() => UsersModule),
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => PrivateAPISettingsModule),
        forwardRef(() => CreditModule),
        forwardRef(() => TaxModule),
        forwardRef(() => InfluxModule),
    ],
    exports: [PaymentService],
})
export class PaymentModule implements OnModuleInit {
    private creditService: CreditService;
    private taxService: TaxService;
    constructor(
        private paymentService: PaymentService,
        private moduleRef: ModuleRef,
    ) {}
    onModuleInit() {
        this.creditService = this.moduleRef.get(CreditService, { strict: false });
        this.taxService = this.moduleRef.get(TaxService, { strict: false });
        PaymentService.subscribe(this.creditService, this.taxService, this.paymentService);
    }
}
