import { Module } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { InfluxModule } from '../influx/influx.module';

@Module({
    controllers: [InboxController],
    providers: [InboxService],
    imports: [InfluxModule],
})
export class PrivateInboxModule {}
