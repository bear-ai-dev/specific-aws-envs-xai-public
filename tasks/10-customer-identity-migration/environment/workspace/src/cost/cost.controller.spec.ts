import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { CostController } from './cost.controller';
import { forwardRef } from '@nestjs/common';
import { CostService } from './cost.service';

describe('CostController', () => {
    let controller: CostController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [CostController],
            providers: [CostService],
            imports: [InfluxModule, forwardRef(() => PrivateAPIServicesModule)],
        }).compile();

        controller = module.get<CostController>(CostController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
