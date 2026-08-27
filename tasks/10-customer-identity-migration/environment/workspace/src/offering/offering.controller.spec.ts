import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { PublicAPIOfferingController } from './offering.controller';
import { OfferingService } from './offering.service';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';
import { PrivateAPIServicesModule } from '../services/services.module';

describe('OfferingController', () => {
    let controller: PublicAPIOfferingController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PublicAPIOfferingController],
            providers: [OfferingService],
            imports: [InfluxModule, PublicAPIDimensionsModule, PrivateAPIServicesModule],
        }).compile();

        controller = module.get<PublicAPIOfferingController>(PublicAPIOfferingController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
