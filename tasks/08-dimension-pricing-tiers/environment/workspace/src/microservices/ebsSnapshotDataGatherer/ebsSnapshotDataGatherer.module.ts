import { Module } from '@nestjs/common';
import { EbsSnapshotDataGathererService } from './ebsSnapshotDataGatherer.service.js';
import { BullModule } from '@nestjs/bull';
import { InfluxModule } from '../../influx/influx.module.js';

@Module({
    controllers: [],
    providers: [EbsSnapshotDataGathererService],
    imports: [
        BullModule.registerQueue({
            name: 'scheduler_queue',
        }),
        InfluxModule,
    ],
})
export class EbsSnapshotDataGathererModule {}
