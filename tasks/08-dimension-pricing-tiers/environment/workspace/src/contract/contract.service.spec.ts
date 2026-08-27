import { Test, TestingModule } from '@nestjs/testing';
import { ContractService } from './contract.service';
import { createMock } from '@golevelup/ts-jest';
import { OfferingService } from '../offering/offering.service';
import { CustomerService } from '../customer/customer.service';
import { InvoicesService } from '../invoice/invoices.service';
import { InfluxService } from '../influx/influx.service';
import { ReadOfferingResponseData } from '../offering/dto/readOffering.dto';
import { OfferingType } from '../offering/entities/OfferingType';
import { dimensionUnit } from '../dimensions/entities/dimensions.entity';
import { countBasedUnits, roundingEnum } from '../dimensions/dto/create-dimension.dto';
import { paymentChannel } from '../customer/dto/create-customer.dto';
import { Offering } from '../offering/entities/offeringPackage.entity';
import { ReadCustomerResponseData } from '../customer/entities/customer.entity';
import { DatetimeUtils } from '../utils/datetime';

describe('ContractService', () => {
    let service: ContractService;
    let invoicesService: InvoicesService;
    let offeringService: OfferingService;
    let customerService: CustomerService;
    let influxService: InfluxService;

    beforeEach(async () => {
        jest.useFakeTimers('modern').setSystemTime(new Date('2023-08-16'));
        const module: TestingModule = await Test.createTestingModule({
            providers: [ContractService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get<ContractService>(ContractService);
        offeringService = module.get(OfferingService);
        customerService = module.get(CustomerService);
        invoicesService = module.get(InvoicesService);
        influxService = module.get(InfluxService);
    });
    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should handle creating a contract and calling influx', async () => {
        const createContractDto = {
            customerId: 'fake-customer-id',
            offeringId: 'fake-offering-id',
            businessID: 'fake-business-id',
            readSettingsResponseData: { id: 'fake-offering-id', name: 'fake-offering-name' },
        };
        const preparedContract = {
            offering: {
                enroll: jest.fn(),
            },
        };
        jest.spyOn(service, 'prepareCustomerContract').mockResolvedValueOnce(preparedContract);
        jest.spyOn(influxService, 'loadPoints');
        jest.spyOn(influxService, 'getPoint');

        await expect(service.create(createContractDto)).resolves.toEqual({
            message: 'Loaded Contract Points',
            ...preparedContract,
        });
        expect(service.prepareCustomerContract).toHaveBeenCalledWith(createContractDto);
        expect(influxService.loadPoints).toHaveBeenCalledTimes(1);
        expect(influxService.loadPoints).toHaveBeenCalledWith(
            `${process.env.STAGE}-config`,
            process.env.INFLUX_ORG,
            expect.anything(),
        );
        expect(influxService.getPoint).toHaveBeenCalledTimes(1);
    });

    it('Should handle preparing a contract correctly in a case with no customer contract overrides', async () => {
        const createContractDto = {
            customerId: 'fake-customer-id',
            offeringId: 'fake-offering-id',
            businessID: 'fake-business-id',
        };
        const offeringConfig: ReadOfferingResponseData = {
            offeringId: 'fake-offering-id',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [],
        };

        jest.spyOn(offeringService, 'findOne').mockResolvedValueOnce({
            data: [offeringConfig],
            message: 'foobar',
        });
        jest.spyOn(service, 'prepareCustomerContract');

        const res = await service.create(createContractDto);
        expect(service.prepareCustomerContract).toHaveBeenCalledWith(createContractDto);
        expect(offeringService.findOne).toHaveBeenCalledWith({
            businessID: createContractDto.businessID,
            offeringId: createContractDto.offeringId,
        });
        expect(res).toEqual({
            message: 'Loaded Contract Points',
            offering: expect.objectContaining({
                enroll: expect.anything(),
            }),
            businessID: createContractDto.businessID,
            customerId: createContractDto.customerId,
            offeringId: createContractDto.offeringId,
            offeringEnrollmentDate: expect.anything(),
            overridesForOffering: expect.objectContaining({}),
        });
    });
    it('Should handle preparing a contract correctly in a case with discounts', async () => {
        const createContractDto = {
            customerId: 'fake-customer-id',
            offeringId: 'fake-offering-id',
            businessID: 'fake-business-id',
            discount: {
                name: 'fake-discount-name',
                percentage: '2',
            },
        };
        const offeringConfig: ReadOfferingResponseData = {
            offeringId: 'fake-offering-id',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [],
        };

        jest.spyOn(offeringService, 'findOne').mockResolvedValueOnce({
            data: [offeringConfig],
            message: 'foobar',
        });
        jest.spyOn(service, 'prepareCustomerContract');

        const res = await service.create(createContractDto);
        expect(service.prepareCustomerContract).toHaveBeenCalledWith(createContractDto);
        expect(offeringService.findOne).toHaveBeenCalledWith({
            businessID: createContractDto.businessID,
            offeringId: createContractDto.offeringId,
        });
        expect(res).toEqual({
            message: 'Loaded Contract Points',
            offering: expect.objectContaining({
                enroll: expect.anything(),
                discount: expect.objectContaining({
                    name: createContractDto.discount.name,
                    percentage: createContractDto.discount.percentage,
                }),
            }),
            overridesForOffering: expect.objectContaining({
                discount: expect.objectContaining({
                    name: createContractDto.discount.name,
                    percentage: createContractDto.discount.percentage,
                }),
            }),
            businessID: createContractDto.businessID,
            customerId: createContractDto.customerId,
            offeringId: createContractDto.offeringId,
            offeringEnrollmentDate: expect.anything(),
        });
    });
    it('Should handle preparing a contract correctly in a case with discounts and dimensions', async () => {
        const createContractDto = {
            customerId: 'fake-customer-id',
            offeringId: 'fake-offering-id',
            businessID: 'fake-business-id',
            discount: {
                name: 'fake-discount-name',
                percentage: '2',
            },
        };
        const offeringConfig: ReadOfferingResponseData = {
            offeringId: 'fake-offering-id',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };

        jest.spyOn(offeringService, 'findOne').mockResolvedValueOnce({
            data: [offeringConfig],
            message: 'foobar',
        });
        jest.spyOn(service, 'prepareCustomerContract');

        const res = await service.create(createContractDto);
        expect(service.prepareCustomerContract).toHaveBeenCalledWith(createContractDto);
        expect(offeringService.findOne).toHaveBeenCalledWith({
            businessID: createContractDto.businessID,
            offeringId: createContractDto.offeringId,
        });
        expect(res).toEqual({
            message: 'Loaded Contract Points',
            offering: expect.objectContaining({
                enroll: expect.anything(),
                discount: expect.objectContaining({
                    name: createContractDto.discount.name,
                    percentage: createContractDto.discount.percentage,
                }),
            }),
            overridesForOffering: expect.objectContaining({
                discount: expect.objectContaining({
                    name: createContractDto.discount.name,
                    percentage: createContractDto.discount.percentage,
                }),
            }),
            businessID: createContractDto.businessID,
            customerId: createContractDto.customerId,
            offeringId: createContractDto.offeringId,
            offeringEnrollmentDate: expect.anything(),
        });
    });
    it('Should handle enrollments correctly', async () => {
        const offering = {
            enroll: jest.fn(),
        } as unknown as Offering;
        const customer = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'fake-offering-id',
            offering,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
        };
        const subject = 'fake subject';
        const offeringConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.subscription,
            freeTrialLength: '1',
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        const preparedContract = {
            offering,
            customerId: customer.customerId,
            businessID: customer.businessID,
            offeringEnrollmentDate: new Date().toISOString(),
            readOfferingResponseData: offeringConfig,
        };

        const res = await service.enrollCustomerInContract(
            preparedContract,
            subject,
            customer as unknown as ReadCustomerResponseData,
        );

        expect(offering.enroll).toHaveBeenCalledWith(subject, customer);
        expect(res).toEqual({
            message: `Customer: ${preparedContract?.customerId} successfully onboarded`,
        });
    });
    it('FTPCOP-27 Updates for customer should not change the free trial end date if the date is in the past', async () => {
        const oldFreeTrialDate = DatetimeUtils.daysBeforeDate(new Date(), 2).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.subscription,
            freeTrialLength: '1',
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            freeTrialLength: undefined,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: oldFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(res.freeTrialEndDate).toEqual(oldFreeTrialDate);
        expect(res.offeringEnrollmentDate).toBeDefined();
        expect(new Date(res.offeringEnrollmentDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
        expect(unenrollMock).toHaveBeenCalledTimes(1);
        expect(enrollMock).toHaveBeenCalledTimes(1);
    });
    it('FTPCOP-26 Updates for customer should not change the free trial end date if the date is in the past for usage based offerings', async () => {
        const oldFreeTrialDate = DatetimeUtils.daysBeforeDate(new Date(), 2).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            freeTrialLength: '1',
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            freeTrialLength: undefined,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: oldFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(res.freeTrialEndDate).toEqual(oldFreeTrialDate);
        expect(res.offeringEnrollmentDate).toBeDefined();
        expect(new Date(res.offeringEnrollmentDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
        expect(unenrollMock).toHaveBeenCalledTimes(1);
        expect(enrollMock).toHaveBeenCalledTimes(1);
    });

    it('FTPCOP-7: Should change the free trial end date to this exact moment if the new offering does not have a free trial', async () => {
        const newFreeTrialDate = DatetimeUtils.endOfTomorrow(new Date()).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            freeTrialLength: '1',
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: newFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(res.freeTrialEndDate).toEqual(newFreeTrialDate);
        expect(res.offeringEnrollmentDate).toBeDefined();
        expect(new Date(res.offeringEnrollmentDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
        expect(unenrollMock).toHaveBeenCalledTimes(1);
        expect(enrollMock).toHaveBeenCalledTimes(1);
    });
    it('FTPCOP-6: Should change the free trial end date to this exact moment if the new offering does not have a free trial', async () => {
        const newFreeTrialDate = DatetimeUtils.endOfTomorrow(new Date()).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            freeTrialLength: '1',
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            freeTrialLength: undefined,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: newFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(new Date(res.freeTrialEndDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
        expect(res.offeringEnrollmentDate).toBeDefined();
        expect(new Date(res.offeringEnrollmentDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
        expect(unenrollMock).toHaveBeenCalledTimes(1);
        expect(enrollMock).toHaveBeenCalledTimes(1);
    });
    it('should call unenrollment with credit when there is another offering included in the update request', async () => {
        const newFreeTrialDate = DatetimeUtils.endOfTomorrow(new Date()).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: newFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(new Date(res.offeringEnrollmentDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
        expect(unenrollMock).toHaveBeenCalledTimes(1);
        expect(enrollMock).toHaveBeenCalledTimes(1);

        expect(unenrollMock).toHaveBeenCalledWith(
            expect.objectContaining({
                shouldCreditRemainingPlan: true,
                isChangeOfPlan: true,
            }),
        );
    });

    it('should set offeringEnrollmentDate if the update includes a new offeringId', async () => {
        const newFreeTrialDate = DatetimeUtils.endOfTomorrow(new Date()).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: newFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(res.offeringEnrollmentDate).toBeDefined();
        expect(new Date(res.offeringEnrollmentDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
    });

    it('should not call unenrollment with credit when there is not another offering in the update request', async () => {
        const newFreeTrialDate = DatetimeUtils.endOfTomorrow(new Date()).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: newFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: null,
            subject: 'fake',
        });
        expect(unenrollMock).toHaveBeenCalledTimes(1);
        expect(enrollMock).toHaveBeenCalledTimes(0);

        expect(unenrollMock).toHaveBeenCalledWith(
            expect.objectContaining({
                shouldCreditRemainingPlan: false,
                isChangeOfPlan: false,
            }),
        );
    });
    it('should not call unenrollment with credit when there is not an offering in the orginal customer', async () => {
        const newFreeTrialDate = DatetimeUtils.endOfTomorrow(new Date()).toISOString();
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            freeTrialEndDate: newFreeTrialDate,
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(new Date(res.offeringEnrollmentDate).getTime()).toBeCloseTo(new Date().getTime(), -1);
        expect(unenrollMock).toHaveBeenCalledTimes(0);
        expect(enrollMock).toHaveBeenCalledTimes(1);
    });
    it('Should return prepaidCredit if there is prepaid credit on the offering', async () => {
        const currentOfferingConfig: ReadOfferingResponseData = {
            offeringId: 'current-offering',
            offeringName: 'fake-offering-name',
            offeringType: OfferingType.usageBased,
            dimensions: [
                {
                    dimensionId: '123',
                    dimensionName: 'fake-dimension-name',
                    consumptionPrice: '1',
                    consumptionUnit: { type: 'count', unit: countBasedUnits['count-based'] },
                    usageIncrement: '1',
                    rounding: roundingEnum.ceiling,
                },
            ],
        };
        jest.spyOn(offeringService, 'findOne').mockImplementation(async ({ offeringId }) => {
            if (offeringId === 'current-offering') {
                return { data: [currentOfferingConfig], message: 'foobar' };
            } else if (offeringId === 'new-offering') {
                return {
                    data: [
                        {
                            ...currentOfferingConfig,
                            offeringId: 'new-offering',
                            offeringName: 'new-offering-name',
                            prepaidCredit: '1000',
                        },
                    ],
                    message: 'foobar',
                };
            }
        });
        jest.spyOn(influxService, 'getLatestCustomerContract').mockResolvedValue([]);
        const enrollMock = jest.fn();
        const unenrollMock = jest.fn();
        jest.spyOn(Offering, 'getInstance').mockImplementation(
            () =>
                ({
                    unenroll: unenrollMock,
                    enroll: enrollMock,
                }) as unknown as Offering,
        );
        const customer: ReadCustomerResponseData = {
            customerId: 'fake-customer-id',
            businessID: 'fake-business-id',
            offeringId: 'current-offering',
            offering: currentOfferingConfig,
            paymentChannel: paymentChannel.manual,
            customerName: 'fake-customer-name',
            offeringEnrollmentDate: DatetimeUtils.randomTimeAndDateLastMonth(new Date()).toISOString(),
        };
        const res = await service.changeCustomerContract({
            customer,
            oldOfferingId: 'current-offering',
            newOfferingId: 'new-offering',
            subject: 'fake',
        });
        expect(unenrollMock).toHaveBeenCalledTimes(1);
        expect(enrollMock).toHaveBeenCalledTimes(1);

        expect(unenrollMock).toHaveBeenCalledWith(
            expect.objectContaining({
                shouldCreditRemainingPlan: true,
                isChangeOfPlan: true,
            }),
        );
        expect(res.prepaidCredit).toEqual('1000');
    });
});
