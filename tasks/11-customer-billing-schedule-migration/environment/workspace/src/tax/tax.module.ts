import { forwardRef, Module } from '@nestjs/common';
import { TaxService } from './tax.service';
import { TaxController } from './tax.controller';
import { PrivateAPISettingsModule } from '../setting/settings.module';

@Module({
    controllers: [TaxController],
    providers: [TaxService],
    imports: [PrivateAPISettingsModule],
    exports: [TaxService],
})
export class TaxModule {}
