import { Module } from '@nestjs/common';
import { FeatureRequestService } from './featureRequest.service.js';
import { FeatureRequestController } from './featureRequest.controller.js';
import { InfluxModule } from '../influx/influx.module.js';

@Module({
    controllers: [FeatureRequestController],
    providers: [FeatureRequestService],
    imports: [InfluxModule],
})
export class FeatureRequestModule {}
