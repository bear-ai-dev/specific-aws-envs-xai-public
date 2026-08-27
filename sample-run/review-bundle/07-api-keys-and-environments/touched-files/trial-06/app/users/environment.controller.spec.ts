import { createMock } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module.js';
import { EnvironmentController } from './environment.controller.js';
import { EnvironmentService } from './users.service.js';

describe('EnvironmentController', () => {
    let controller: EnvironmentController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [EnvironmentController],
            providers: [EnvironmentService],
            imports: [InfluxModule],
        })
            .useMocker(createMock)
            .compile();

        controller = module.get<EnvironmentController>(EnvironmentController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
