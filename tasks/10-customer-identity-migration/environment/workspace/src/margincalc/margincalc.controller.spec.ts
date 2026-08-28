import { Test, TestingModule } from '@nestjs/testing';
import { MargincalcController } from './margincalc.controller';
import { MargincalcService } from './margincalc.service';

describe('MargincalcController', () => {
    let controller: MargincalcController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [MargincalcController],
            providers: [MargincalcService],
        }).compile();

        controller = module.get<MargincalcController>(MargincalcController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
