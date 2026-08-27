import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';
import { PrivateAPIServicesModule } from '../services/services.module';

@Module({
    controllers: [AnalyticsController],
    providers: [AnalyticsService],
    imports: [InfluxModule, PrivateAPISettingsModule, PrivateAPIServicesModule],
})
export class PrivateAPIAnalyticsModule {}
