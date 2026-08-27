import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';
import { PrivateAPIServicesModule } from '../services/services.module';

describe('AnalyticsController', () => {
    let controller: AnalyticsController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AnalyticsController],
            providers: [AnalyticsService],
            imports: [InfluxModule, PrivateAPISettingsModule, PrivateAPIServicesModule],
        }).compile();

        controller = module.get<AnalyticsController>(AnalyticsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
