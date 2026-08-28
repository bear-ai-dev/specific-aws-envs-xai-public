import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { InfluxModule } from '../influx/influx.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
    controllers: [SettingsController],
    providers: [SettingsService],
    imports: [InfluxModule],
    exports: [SettingsService],
})
export class PrivateAPISettingsModule {}
