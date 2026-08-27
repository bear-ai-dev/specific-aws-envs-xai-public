import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { InfluxModule } from '../influx/influx.module';

describe('SettingService', () => {
    let service: SettingsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SettingsController],
            providers: [SettingsService],
            imports: [InfluxModule],
            exports: [SettingsService],
        }).compile();

        service = module.get<SettingsService>(SettingsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
