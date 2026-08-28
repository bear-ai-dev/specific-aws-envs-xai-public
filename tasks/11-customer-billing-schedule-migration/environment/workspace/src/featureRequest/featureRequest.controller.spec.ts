import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { FeatureRequestController } from './featureRequest.controller';
import { FeatureRequestService } from './featureRequest.service';

describe('FeatureRequestController', () => {
    let controller: FeatureRequestController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [FeatureRequestController],
            providers: [FeatureRequestService],
            imports: [InfluxModule],
        }).compile();

        controller = module.get<FeatureRequestController>(FeatureRequestController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
