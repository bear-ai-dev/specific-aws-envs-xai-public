import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { InfluxModule } from '../../influx/influx.module';
import { Ec2InstanceDataGathererService } from './ec2InstanceDataGatherer.service';

@Module({
    controllers: [],
    providers: [Ec2InstanceDataGathererService],
    imports: [
        BullModule.registerQueue({
            name: 'scheduler_queue',
        }),
        InfluxModule,
    ],
})
export class Ec2InstanceDataGathererModule {}
