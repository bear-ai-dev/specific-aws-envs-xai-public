import { Module } from '@nestjs/common';
import { EbsVolumeDataGathererService } from './ebsvolumeDataGatherer.service';
import { BullModule } from '@nestjs/bull';
import { InfluxModule } from '../../influx/influx.module';

@Module({
    controllers: [],
    providers: [EbsVolumeDataGathererService],
    imports: [
        BullModule.registerQueue({
            name: 'scheduler_queue',
        }),
        InfluxModule,
    ],
})
export class EbsVolumeDataGathererModule {}
