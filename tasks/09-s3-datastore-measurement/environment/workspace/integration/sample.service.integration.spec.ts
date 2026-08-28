/**
 *
 *
 * A sample test file
 */
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../src/influx/influx.module';
import { InstanceUptimeService } from '../src/microservices/instanceUpTime/instanceUptime.service';

describe('Instance Uptime', () => {
    let service: InstanceUptimeService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [InstanceUptimeService],
            imports: [InfluxModule],
        }).compile();

        // service = module.get<InstanceUptimeService>(InstanceUptimeService);
    });

    test('Should work as expected when called', async () => {
        expect(true).toEqual(true);
    });
});
