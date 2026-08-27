import { createMock } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { EnvironmentService, UsersService } from '../users/users.service.js';
import { KeysController } from './keys.controller.js';
import { KeysService } from './keys.service.js';

describe('KeysController', () => {
    let controller: KeysController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [KeysController],
            providers: [KeysService, UsersService, EnvironmentService],
        })
            .useMocker(createMock)
            .compile();

        controller = module.get<KeysController>(KeysController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
