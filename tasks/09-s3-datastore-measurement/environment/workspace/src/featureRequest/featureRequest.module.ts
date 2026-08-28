import { Module } from '@nestjs/common';
import { FeatureRequestService } from './featureRequest.service';
import { FeatureRequestController } from './featureRequest.controller';
import { InfluxModule } from '../influx/influx.module';

@Module({
    controllers: [FeatureRequestController],
    providers: [FeatureRequestService],
    imports: [InfluxModule],
})
export class FeatureRequestModule {}
