import { Module, forwardRef } from '@nestjs/common';
import { TaxService } from './tax.service.js';
import { InfluxModule } from '../influx/influx.module.js';

@Module({
    providers: [TaxService],
    imports: [forwardRef(() => InfluxModule)],
    exports: [TaxService],
})
export class TaxModule {}
