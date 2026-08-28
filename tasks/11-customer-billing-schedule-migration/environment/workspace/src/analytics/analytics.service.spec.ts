import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPISettingsModule } from '../setting/settings.module';
import { PrivateAPIServicesModule } from '../services/services.module';

describe('AnalyticsService', () => {
    let service: AnalyticsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [AnalyticsService],
            imports: [InfluxModule, PrivateAPISettingsModule, PrivateAPIServicesModule],
        }).compile();

        service = module.get<AnalyticsService>(AnalyticsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
