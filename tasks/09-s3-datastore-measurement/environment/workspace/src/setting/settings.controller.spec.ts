import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { InfluxModule } from '../influx/influx.module';

describe('SettingsController', () => {
    let controller: SettingsController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [SettingsController],
            providers: [SettingsService],
            imports: [InfluxModule],
            exports: [SettingsService],
        }).compile();

        controller = module.get<SettingsController>(SettingsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
