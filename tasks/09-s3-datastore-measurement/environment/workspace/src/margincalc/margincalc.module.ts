import { Module } from '@nestjs/common';
import { MargincalcService } from './margincalc.service';
import { MargincalcController } from './margincalc.controller';

@Module({
    controllers: [MargincalcController],
    providers: [MargincalcService],
})
export class MargincalcModule {}
