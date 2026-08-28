import { Test, TestingModule } from '@nestjs/testing';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InfluxModule } from '../influx/influx.module';

describe('InboxController', () => {
    let controller: InboxController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [InboxController],
            providers: [InboxService],
            imports: [InfluxModule],
        }).compile();

        controller = module.get<InboxController>(InboxController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
