import { Module, forwardRef } from '@nestjs/common';
import { CostService } from './cost.service';
import { CostController } from './cost.controller';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPIServicesModule } from '../services/services.module';

@Module({
    controllers: [CostController],
    providers: [CostService],
    imports: [InfluxModule, forwardRef(() => PrivateAPIServicesModule)],
})
export class CostModule {}
