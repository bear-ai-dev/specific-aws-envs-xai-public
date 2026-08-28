import { forwardRef, Module } from '@nestjs/common';
import { PortalService } from './portal.service.js';
import { PortalController } from './portal.controller.js';
import { PrivateAPICustomerModule } from '../customer/customer.module.js';
import { PrivateAPIInvoicesModule } from '../invoice/invoices.module.js';
import { PrivateAPISettingsModule } from '../setting/settings.module.js';
import { PrivateApiUsageModule } from '../usage/usage.module.js';

@Module({
    controllers: [PortalController],
    providers: [PortalService],
    imports: [
        forwardRef(() => PrivateAPICustomerModule),
        forwardRef(() => PrivateAPIInvoicesModule),
        forwardRef(() => PrivateAPISettingsModule),
        forwardRef(() => PrivateApiUsageModule),
    ],
})
export class PortalModule {}
