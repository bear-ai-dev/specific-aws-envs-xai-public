import { createMock } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module.js';
import { FeatureRequestService } from './featureRequest.service.js';

describe('FeatureRequestService', () => {
    let service: FeatureRequestService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [FeatureRequestService],
            imports: [InfluxModule],
        })
            .useMocker(createMock)
            .compile();

        service = module.get<FeatureRequestService>(FeatureRequestService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
