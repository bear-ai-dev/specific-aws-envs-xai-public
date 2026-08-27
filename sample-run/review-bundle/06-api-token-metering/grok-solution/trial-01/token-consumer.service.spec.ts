import { Test, TestingModule } from '@nestjs/testing';
import { TokenConsumerService } from './token-consumer.service';
import { createMock } from '@golevelup/ts-jest';

describe('TokenConsumerService', () => {
    let service: TokenConsumerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [TokenConsumerService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get<TokenConsumerService>(TokenConsumerService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
