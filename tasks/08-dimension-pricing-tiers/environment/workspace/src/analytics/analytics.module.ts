import { forwardRef, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { InfluxModule } from '../influx/influx.module.js';
import { PrivateAPISettingsModule } from '../setting/settings.module.js';
import { PrivateAPIServicesModule } from '../services/services.module.js';

@Module({
    controllers: [AnalyticsController],
    providers: [AnalyticsService],
    imports: [forwardRef(() => InfluxModule), PrivateAPISettingsModule, PrivateAPIServicesModule],
})
export class PrivateAPIAnalyticsModule {}
