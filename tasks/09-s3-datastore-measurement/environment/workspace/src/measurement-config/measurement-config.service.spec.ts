import { Test, TestingModule } from '@nestjs/testing';
import { forwardRef } from '@nestjs/common';
import { InfluxModule } from '../influx/influx.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { MeasurementConfigService } from './measurement-config.service';
import { PrivateAPIDimensionsModule } from '../dimensions/dimensions.module';
import { measurementMode } from './dto/create-measurement-config.dto';
import {
    InfrastructureAccessInformation,
    supportedCloudPlatforms,
    SupportedResources,
} from './entities/measurement-config.entity';
import { InfluxService } from '../influx/influx.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { DimensionsService } from '../dimensions/dimensions.service';
import { dataBasedUnits, roundingEnum } from '../dimensions/dto/create-dimension.dto';

describe('MeasurementConfigService', () => {
    let service: MeasurementConfigService;
    // const client = createClient();
    // afterAll(async () => {
    //     await client.quit();
    // });
    const fakeSubject = 'fakeSubject';
    const mockInfrastructureMeasurementInput = {
        measurementConfiguration: new InfrastructureAccessInformation({
            iamRoleArn: 'fakeARN',
            externalId: 'fakeID',
            cloudPlatform: supportedCloudPlatforms.aws,
            region: 'us-east-1',
            resourceType: SupportedResources.k8sPod,
        }),
        measurementMode: measurementMode.infrastructureBased,
        dimensionIds: ['1234'],
        businessID: 'fakeBusiness',
    };
    const mockEBSInfraMeasurement = {
        measurementConfiguration: new InfrastructureAccessInformation({
            iamRoleArn: 'fakeARN',
            externalId: 'fakeID',
            cloudPlatform: supportedCloudPlatforms.aws,
            region: 'us-east-1',
            resourceType: SupportedResources.ebs,
        }),
        measurementMode: measurementMode.infrastructureBased,
        dimensionIds: ['1234'],
        businessID: 'fakeBusiness',
    };
    const mockEBSSnapshots = {
        measurementConfiguration: new InfrastructureAccessInformation({
            iamRoleArn: 'fakeARN',
            externalId: 'fakeID',
            cloudPlatform: supportedCloudPlatforms.aws,
            region: 'us-east-1',
            resourceType: SupportedResources.ebssnapshot,
        }),
        measurementMode: measurementMode.infrastructureBased,
        dimensionIds: ['1234'],
        businessID: 'fakeBusiness',
    };
    const mockLoadPoints = jest.fn();
    const mockCreateSchedules = jest.fn();
    const mockTransformDTOtoEntityInput = jest.fn();
    const mockFindOneByDimensionId = jest.fn();
    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [MeasurementConfigService],
            imports: [],
        })
            .useMocker((token) => {
                if (token === InfluxService) {
                    return {
                        loadPoints: mockLoadPoints,
                        getPoint: () => ({ tag: jest.fn(), stringField: jest.fn() }),
                        readMeasurementConfigDataByDimensionId: () => [],
                    };
                }
                if (token === SchedulerService) {
                    return {
                        create: mockCreateSchedules,
                    };
                }
                if (token === DimensionsService) {
                    return {
                        transformDtoToEntityInput: mockTransformDTOtoEntityInput,
                        findOneByDimensionId: mockFindOneByDimensionId,
                    };
                }
            })
            .compile();

        service = module.get<MeasurementConfigService>(MeasurementConfigService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // it('should properly setup dimensions with the correct preset defaults', async () => {
    //     await service.createMeasurementConfig(
    //         {
    //             dimensionName: 'fakeDimension',
    //             businessID: 'fakeBusiness',
    //             measurementId: '1234',
    //             usageIncrement: 1,
    //             rounding: roundingEnum.floor,
    //             consumptionPrice: '0.00',
    //             consumptionUnit: { unit: dataBasedUnits.gigabyte, type: 'data' },
    //         },
    //         '1234',
    //         'fakeBusiness',
    //         'fake-dimension-1234',
    //         fakeSubject
    //     );
    // });
});
