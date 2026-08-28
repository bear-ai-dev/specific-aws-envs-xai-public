import { Test, TestingModule } from '@nestjs/testing';
import { InfluxModule } from '../influx/influx.module';
import { PrivateAPIServicesModule } from '../services/services.module';
import { forwardRef } from '@nestjs/common';
import { CostService } from './cost.service';

const ONE_HOUR_IN_SECONDS = 3600;

describe('CostService', () => {
    let service: CostService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [CostService],
            imports: [InfluxModule, forwardRef(() => PrivateAPIServicesModule)],
        }).compile();

        service = module.get<CostService>(CostService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('EBS Cost', () => {
        it('should only lookup volume types which are supported', () => {
            expect(service).toBeDefined();
        });
        it('should only lookup regions which are supported', () => {
            expect(service).toBeDefined();
        });

        it('should lookup ebs costs for each service on each business', () => {
            expect(service).toBeDefined();
        });

        it('should get current costs for AWS services from their billing API per each region and EBS volume type', () => {
            expect(service).toBeDefined();
        });

        it('If a single service lookup fails, the rest are not effected', () => {
            expect(service).toBeDefined();
        });
        it('Should properly calculate the cost of running an EBS volume, given the capacity, IOPS, and price document', () => {
            expect(service).toBeDefined();
        });
        it('Should commit average cost to a ledger', () => {
            expect(service).toBeDefined();
        });
    });
    describe('EKS Cost', () => {
        it('should only lookup regions which are supported', () => {
            expect(service).toBeDefined();
        });

        it('should lookup EKS Node Pod costs for each business', () => {
            expect(service).toBeDefined();
        });

        it('should Deduplicate multiple pods running on the same instance', () => {
            expect(service).toBeDefined();
        });

        it('Failures with one business should not effect others', () => {
            expect(service).toBeDefined();
        });
        it('Should properly average out the cost of reserved instances', () => {
            expect(service).toBeDefined();
        });
        it('Should properly calculate uptime for a pod within an hour', () => {
            expect(service).toBeDefined();
        });
        it('Should properly handle if there is no uptime for a business', () => {
            expect(service).toBeDefined();
        });
    });
});
