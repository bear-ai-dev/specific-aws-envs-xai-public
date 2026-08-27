import { Test, TestingModule } from '@nestjs/testing';
import { OfferingService } from './offering.service';
import { InfluxService } from '../influx/influx.service';
import { CreateOfferingDTO, offeringType, OfferingVisibility, validBillingCycles } from './dto/createOffering.dto';
import { PublicAPIDimensionsModule } from '../dimensions/dimensions.module';
import { DimensionsService } from '../dimensions/dimensions.service';
import { OfferingPackageEntity } from './entities/offeringPackage.entity';
import { OfferingInfluxRow } from '../influx/entities/offeringInfluxTable.entity';
import { ReadDimensionResponseData } from '../dimensions/dto/read-dimension.dto';
import { dataBasedUnits, roundingEnum } from '../dimensions/dto/create-dimension.dto';
import { ServicesService } from '../services/services.service';

describe('OfferingService', () => {
    const mockData: CreateOfferingDTO = {
        offeringVisibility: OfferingVisibility.private,
        billingCycle: validBillingCycles.monthly,

        offeringName: 'testpricingplan',

        currency: 'USD',

        businessID: 'test1234',

        offeringType: offeringType['usage-based'],
        dimensionIds: ['12345'],
    };
    const mockFoundInfluxData: Array<any> = [
        {
            offeringId: 'fake',
            offeringType: 'usage-based',
            offeringVisibility: 'private',
            _value: 'temp',
            _field: 'offeringName',
            currency: 'USD',
            businessID: 'myCoolCorp',
            _measurement: OfferingPackageEntity._measurement,
            _time: new Date().toISOString(),
            dimensionId_12345: '12345',
        },
    ];

    const transformerMock = jest.spyOn(OfferingPackageEntity, 'transformer').mockImplementation(() => {
        return [];
    });
    let service: OfferingService;
    const mockLoadPoints = jest.fn();
    const mockFindOne = jest.fn((): { data: ReadDimensionResponseData[]; message: string } => ({
        data: [
            {
                dimensionId: '12345',
                dimensionName: 'myCoolName',
                consumptionPrice: '20.00',
                consumptionUnit: { unit: dataBasedUnits.gigabyte, type: 'data' },
                usageIncrement: 1,
                rounding: roundingEnum.ceiling,
            },
        ],
        message: 'test message',
    }));
    const mockTag = jest.fn();
    const mockGetLatestOfferingConfig = jest.fn(() => mockFoundInfluxData);
    beforeEach(async () => {
        process.env.STAGE = 'unit-test';
        const module: TestingModule = await Test.createTestingModule({
            providers: [OfferingService],
            imports: [],
        })
            .useMocker((token) => {
                if (token === InfluxService) {
                    return {
                        loadPoints: mockLoadPoints,
                        getPoint: () => ({ tag: mockTag, stringField: jest.fn() }),
                        getLatestOfferingConfig: mockGetLatestOfferingConfig,
                    };
                }
                if (token === DimensionsService) {
                    return {
                        findOne: mockFindOne,
                    };
                }
                if (token === ServicesService) {
                    return {};
                }
            })
            .compile();

        service = module.get<OfferingService>(OfferingService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });
    afterAll(() => {
        process.env.STAGE = undefined;
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should call load points correctly', async () => {
        await service.create(mockData);
        expect(mockLoadPoints).toBeCalledTimes(1);
    });
    it('should check if dimensions are live', async () => {
        await service.create(mockData);
        expect(mockFindOne).toBeCalledTimes(mockData.dimensionIds.length);
    });
    it('should handle idempotent put updates correctly', async () => {
        await service.update({ ...mockData, offeringId: 'fake' });

        expect(mockLoadPoints).toBeCalledTimes(1);
        expect(transformerMock).toBeCalledTimes(1);
        expect(mockGetLatestOfferingConfig).toBeCalledTimes(1);
        expect(mockGetLatestOfferingConfig).toBeCalledWith({ businessID: mockData.businessID, offeringId: 'fake' });
        expect(transformerMock).toBeCalledWith(expect.objectContaining({ dimensionIds: ['12345'] }), expect.anything());
    });
});
