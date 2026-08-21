import { forwardRef, Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { PublicSettingsController, SettingsController } from './settings.controller.js';
import { InfluxModule } from '../influx/influx.module.js';
import { SchedulerModule } from '../scheduler/scheduler.module.js';
import { UsersModule } from '../users/users.module.js';
import { TaxModule } from '../tax/tax.module.js';

@Module({
    controllers: [PublicSettingsController],
    providers: [SettingsService],
    imports: [forwardRef(() => InfluxModule), forwardRef(() => SchedulerModule), forwardRef(() => UsersModule), forwardRef(() => TaxModule)],
    exports: [SettingsService],
})
export class PublicAPISettingModule {}

@Module({
    controllers: [SettingsController],
    providers: [SettingsService],
    imports: [forwardRef(() => InfluxModule), forwardRef(() => SchedulerModule), forwardRef(() => UsersModule), forwardRef(() => TaxModule)],
    exports: [SettingsService],
})
export class PrivateAPISettingsModule extends PublicAPISettingModule {}
