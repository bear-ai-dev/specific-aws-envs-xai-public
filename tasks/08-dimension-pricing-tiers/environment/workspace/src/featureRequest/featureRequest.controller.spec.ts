import { createMock } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module.js';
import { FeatureRequestController } from './featureRequest.controller.js';
import { FeatureRequestService } from './featureRequest.service.js';

describe('FeatureRequestController', () => {
    let controller: FeatureRequestController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [FeatureRequestController],
            providers: [FeatureRequestService],
            imports: [InfluxModule],
        })
            .useMocker(createMock)
            .compile();

        controller = module.get<FeatureRequestController>(FeatureRequestController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
