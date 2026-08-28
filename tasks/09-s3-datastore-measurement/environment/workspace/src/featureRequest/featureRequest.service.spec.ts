import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { FeatureRequestService } from './featureRequest.service';

describe('FeatureRequestService', () => {
    let service: FeatureRequestService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [FeatureRequestService],
            imports: [InfluxModule],
        }).compile();

        service = module.get<FeatureRequestService>(FeatureRequestService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
