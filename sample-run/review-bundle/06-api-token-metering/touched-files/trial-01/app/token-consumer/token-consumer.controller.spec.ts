import { Test, TestingModule } from '@nestjs/testing';
import { TokenConsumerController } from './token-consumer.controller';
import { TokenConsumerService } from './token-consumer.service';
import { createMock } from '@golevelup/ts-jest';

describe('TokenConsumerController', () => {
    let controller: TokenConsumerController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [TokenConsumerController],
            providers: [TokenConsumerService],
        })
            .useMocker(createMock)
            .compile();

        controller = module.get<TokenConsumerController>(TokenConsumerController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
