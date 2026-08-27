import { Module, forwardRef } from '@nestjs/common';
import { InfluxModule } from '../influx/influx.module.js';
import { KeysController } from './keys.controller.js';
import { KeysService } from './keys.service.js';

@Module({
    controllers: [KeysController],
    providers: [KeysService],
    imports: [forwardRef(() => InfluxModule)],
    exports: [KeysService],
})
export class KeysModule {}
