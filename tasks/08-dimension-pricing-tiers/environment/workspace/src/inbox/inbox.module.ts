import { Module } from '@nestjs/common';
import { InboxService } from './inbox.service.js';
import { InboxController } from './inbox.controller.js';
import { InfluxModule } from '../influx/influx.module.js';

@Module({
    controllers: [InboxController],
    providers: [InboxService],
    imports: [InfluxModule],
})
export class PrivateInboxModule {}
