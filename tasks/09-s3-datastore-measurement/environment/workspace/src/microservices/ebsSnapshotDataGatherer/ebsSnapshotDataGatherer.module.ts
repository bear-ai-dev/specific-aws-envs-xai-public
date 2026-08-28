import { Module } from '@nestjs/common';
import { EbsSnapshotDataGathererService } from './ebsSnapshotDataGatherer.service';
import { BullModule } from '@nestjs/bull';
import { InfluxModule } from '../../influx/influx.module';

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
