import { CacheModule, Module } from '@nestjs/common';
import { TransformerService } from './transformer.service';
import { TrasformerController } from './transformer.controller';
import { UsersModule } from '../users/users.module';
import { AgentMeasurementModule } from '../agent-measurement/agent-measurement.module';

@Module({
    imports: [CacheModule.register(), UsersModule, AgentMeasurementModule],
    controllers: [TrasformerController],
    providers: [TransformerService],
})
export class TransformerModule {}
