import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { CreateContractDto } from './dto/createContract.dto';
import { Offering } from '../offering/entities/offeringPackage.entity';
import { ContractEntity } from './entities/contract.entity';
import { InfluxService } from '../influx/influx.service';
import { BasicResponseDTO } from '../basicResponseDTO';
import { ReadContractDto, ReadContractResponseDto } from './dto/readContract.dto';
import { OfferingService } from '../offering/offering.service';
import { ReadOfferingResponseData } from '../offering/dto/readOffering.dto';
import { InvoicesService } from '../invoice/invoices.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CustomerService } from '../customer/customer.service';
import { CustomerOverrides, PrepareContractResponseDto } from './dto/prepareContractResponse.dto';
import { CustomerContractDiscount } from './dto/customerContractDiscount';
import { CreateContractResponseDto } from './dto/createContractResponse.dto';
import { CustomerEntity, ReadCustomerResponseData } from '../customer/entities/customer.entity';
import { ReadSettingsResponseData } from '../setting/dto/read-setting.dto';
import { SettingsService } from '../setting/settings.service';
import { CreditService } from '../credit/credit.service';
import { ContractInfluxRow } from '../influx/entities/contractInfluxRow';
import { joinMetadataObjectsAndRemoveNulls } from '../utils/shared/utils';

@Injectable()
export class ContractService {
    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService,
        @Inject(forwardRef(() => InvoicesService)) readonly invoicesService: InvoicesService,
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => CustomerService)) readonly customerService: CustomerService,
        @Inject(forwardRef(() => SettingsService)) readonly settingsService: SettingsService,
        @Inject(forwardRef(() => CreditService)) readonly creditService: CreditService,
    ) {}
    async create(createContractDto: CreateContractDto): Promise<CreateContractResponseDto> {
        const preparedContract = await this.prepareCustomerContract(createContractDto);

        const entity = new ContractEntity(preparedContract?.offering, {
            businessID: createContractDto.businessID,
            customerId: createContractDto.customerId,
            offeringId: createContractDto.offeringId,
            offeringEnrollmentDate: preparedContract.offeringEnrollmentDate,

            ...preparedContract?.overridesForOffering,
        });
        const points = ContractEntity.transformer(entity, this.influxService);
        const { loadPoints } = this.influxService;
        await loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, points);
        return { message: 'Loaded Contract Points', ...preparedContract };
    }
    async findOne(readContractDto: ReadContractDto): Promise<ReadContractResponseDto> {
        // Takes in an offering, customerId, and businessID
        // Returns the latest contract for that customer which is basically the offering with overrides.
        const { customerId, businessID, offeringId } = readContractDto;
        const { data: offeringResponseData } = await this.offeringService.findOne({
            businessID,
            offeringId,
        });
        const [readSettingsResponseData] = await this.settingsService.findAll({ businessID });
        const offering = Offering.getInstance(
            offeringResponseData[0],
            customerId,
            businessID,
            this.invoicesService,
            readSettingsResponseData,
            this.schedulerService,
            this.customerService,
        );
        const { getLatestCustomerContract } = this.influxService;
        const contractDbModel = await getLatestCustomerContract({
            customerId: readContractDto.customerId,
            businessID: readContractDto.businessID,
        });
        if (contractDbModel && Array.isArray(contractDbModel) && contractDbModel.length > 0) {
            const entity = ContractEntity.dbModelToEntity(contractDbModel[0], offering);
            return new ReadContractResponseDto(entity, offeringResponseData[0]);
        } else {
            return new ReadContractResponseDto(
                {
                    offering,
                    offeringEnrollmentDate: readContractDto?.offeringEnrollmentDate,
                    customerId: readContractDto?.customerId,
                    businessID: readContractDto?.businessID,
                    freeTrialEndDate: readContractDto?.freeTrialEndDate,
                },
                offeringResponseData[0],
            );
        }
    }

    async findAll({
        businessID,
        customers,
    }: {
        businessID: string;
        customers: Array<CustomerEntity>;
    }): Promise<ReadContractResponseDto[]> {
        const { getCustomerContracts } = this.influxService;
        const contractsDbModel = await getCustomerContracts({ businessID });
        const customerIdOfferingIdMap = customers.reduce(
            (acc, { customerId, ...rest }) => {
                acc[customerId] = { customerId, ...rest };
                return acc;
            },
            {} as { [key: string]: CustomerEntity | ContractInfluxRow },
        );
        const contractMap = contractsDbModel.reduce((acc, contractDbModel) => {
            const { customerId } = contractDbModel;
            acc[customerId] = contractDbModel;
            return acc;
        }, customerIdOfferingIdMap);
        const [readSettingsResponseData] = await this.settingsService.findAll({ businessID });
        const { data: readAllOfferingResponseData } = await this.offeringService.findAll({ businessID });

        const contracts = customers.reduce((acc, customer) => {
            const { customerId } = customer;
            const contractDbModel = contractMap[customerId];
            const readOfferingResponseDataElement = readAllOfferingResponseData.find(
                (element) => element.offeringId === contractDbModel.offeringId,
            );
            if ('_value' in contractDbModel) {
                const offering = Offering.getInstance(
                    readOfferingResponseDataElement,
                    customerId,
                    businessID,
                    this.invoicesService,
                    readSettingsResponseData,
                    this.schedulerService,
                    this.customerService,
                );
                const entity = ContractEntity.dbModelToEntity(contractDbModel, offering);
                acc.push(new ReadContractResponseDto(entity, readOfferingResponseDataElement));
            } else {
                const offering = Offering.getInstance(
                    readOfferingResponseDataElement,
                    customerId,
                    businessID,
                    this.invoicesService,
                    readSettingsResponseData,
                    this.schedulerService,
                    this.customerService,
                );
                acc.push(
                    new ReadContractResponseDto(
                        {
                            offering,
                            offeringEnrollmentDate: contractDbModel?.offeringEnrollmentDate,
                            customerId,
                            businessID,
                            freeTrialEndDate: contractDbModel?.freeTrialEndDate,
                        },
                        readOfferingResponseDataElement,
                    ),
                );
            }
            return acc;
        }, [] as ReadContractResponseDto[]);
        return contracts;
    }

    async update({
        customerId,
        businessID,
        offeringId,
        overridesForOffering,
    }: {
        customerId: string;
        businessID: string;
        offeringId: string;
        overridesForOffering: CustomerOverrides;
    }): Promise<{ message: string }> {
        const {
            offering,
            overridesForOffering: currentOverridesForOffering,
            offeringEnrollmentDate,
        } = await this.findOne({
            businessID,
            customerId,
            offeringId,
        });
        const entity = new ContractEntity(offering, {
            businessID,
            customerId,
            offeringId,
            discount: joinMetadataObjectsAndRemoveNulls(
                currentOverridesForOffering?.discount as unknown as Record<string, string>,
                overridesForOffering?.discount as unknown as Record<string, string>,
            ) as unknown as CustomerContractDiscount,
            offeringEnrollmentDate,
        });
        const points = ContractEntity.transformer(entity, this.influxService);
        const { loadPoints } = this.influxService;
        await loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, points);
        return { message: 'Updated Contract' };
    }

    async enrollCustomerInContract(
        preparedContract: PrepareContractResponseDto,
        subject: string,
        customer: ReadCustomerResponseData,
    ): Promise<BasicResponseDTO> {
        const { offering, offeringId, prepaidCredit, businessID, customerId } = preparedContract;

        if (prepaidCredit) {
            await this.creditService.create(
                {
                    transactionAmount: prepaidCredit,
                    customerId,
                    businessID,
                    metadata: {
                        offeringId: offeringId ? offeringId : undefined,
                        reason: `${offering.offeringName} free trial credit`,
                    },
                    timestamp: new Date().toISOString(),
                },
                false,
            );
        }
        await offering.enroll(subject, customer);

        return { message: `Customer: ${preparedContract?.customerId} successfully onboarded` };
    }
    async prepareCustomerContract(createContractDto: CreateContractDto): Promise<PrepareContractResponseDto> {
        const { customerId, offeringId, businessID, readSettingsResponseData, ...rest } = createContractDto;
        let offeringConfig: ReadOfferingResponseData;
        let setReadSettingsResponseData = readSettingsResponseData;
        if (!setReadSettingsResponseData) {
            const [readSettingsResponseDataRes] = await this.settingsService.findAll({ businessID });
            setReadSettingsResponseData = readSettingsResponseDataRes;
        }
        try {
            const {
                data: [offeringData],
            } = await this.offeringService.findOne({ businessID, offeringId });
            offeringConfig = offeringData;
        } catch (e) {
            if (e instanceof NotFoundException) {
                throw new BadRequestException(`Failed to create customer. Offering with ID: ${offeringId} not found`);
            } else {
                throw new BadRequestException(e);
            }
        }

        let freeTrialEndDate;
        if (createContractDto?.freeTrialEndDate) {
            freeTrialEndDate = createContractDto.freeTrialEndDate;
        } else if (offeringConfig?.freeTrialLength) {
            freeTrialEndDate = Offering.calculateFreeTrialEndDate(offeringConfig.freeTrialLength);
        }

        let offering = Offering.getInstance(
            offeringConfig,
            customerId,
            businessID,
            this.invoicesService,
            setReadSettingsResponseData,
            this.schedulerService,
            this.customerService,
            freeTrialEndDate,
        );
        const offeringEnrollmentDate = rest.offeringEnrollmentDate
            ? rest.offeringEnrollmentDate
            : new Date().toISOString();
        offering = this.overrideDefaultOfferingValues({
            offering,
            createContractDto: createContractDto,
        });

        const creditAmount = offeringConfig?.prepaidCredit;

        return new PrepareContractResponseDto({
            overridesForOffering: new CustomerOverrides({
                discount: rest?.discount?.name && new CustomerContractDiscount(rest?.discount),
                freeTrialEndDate,
            }),
            customerId,
            offeringId,
            businessID,
            offering,
            offeringEnrollmentDate,
            prepaidCredit: creditAmount,
            readOfferingResponseData: offeringConfig,
        });
    }
    private overrideDefaultOfferingValues({
        offering,
        createContractDto,
    }: {
        offering: Offering;
        createContractDto: CreateContractDto;
    }): Offering {
        if (createContractDto?.discount) {
            offering.discount = createContractDto.discount;
        }
        return offering;
    }

    async changeCustomerContract({
        customer,
        newOfferingId,
        oldOfferingId,
        businessID,
        subject,
        overridesForCustomer,
    }: {
        customer: ReadCustomerResponseData;
        subject: string;
        businessID: string;
        oldOfferingId?: string | null;
        newOfferingId?: string | null;
        overridesForCustomer?: CustomerOverrides;
    }): Promise<{
        message: string;
        freeTrialEndDate?: string;
        offeringEnrollmentDate?: string;
        freeTrialStartDate?: string;
        prepaidCredit?: string;
    }> {
        let freeTrialEndDate;
        let freeTrialStartDate;
        let prepaidCredit;
        if ((newOfferingId || newOfferingId === null) && newOfferingId !== oldOfferingId) {
            let priorOfferingEnrollmentDate;
            let offeringEnrollmentDate;
            if (oldOfferingId) {
                freeTrialStartDate = customer?.freeTrialStartDate;
                const contract = await this.findOne({
                    customerId: customer.customerId,
                    offeringId: oldOfferingId,
                    businessID,
                    offeringEnrollmentDate: customer.offeringEnrollmentDate,
                    freeTrialEndDate: customer.freeTrialEndDate,
                });
                priorOfferingEnrollmentDate = contract.offeringEnrollmentDate;
                if (
                    contract?.overridesForOffering?.freeTrialEndDate &&
                    new Date(contract?.overridesForOffering?.freeTrialEndDate).getTime() > new Date().getTime()
                ) {
                    freeTrialEndDate = new Date(new Date().getTime()).toISOString();
                } else if (contract?.overridesForOffering?.freeTrialEndDate) {
                    freeTrialEndDate = contract?.overridesForOffering?.freeTrialEndDate;
                }

                await contract.offering.unenroll({
                    shouldCreditRemainingPlan: Boolean(newOfferingId),
                    isChangeOfPlan: Boolean(newOfferingId),
                    customer,
                    creditService: this.creditService,
                });
            }
            if (newOfferingId) {
                const contract = await this.create({
                    offeringId: newOfferingId,
                    customerId: customer.customerId,
                    businessID,
                    offeringEnrollmentDate: new Date().toISOString(),
                    ...overridesForCustomer,
                });
                offeringEnrollmentDate = contract.offeringEnrollmentDate;
                contract.offering.priorOfferingEnrollmentDate = priorOfferingEnrollmentDate
                    ? priorOfferingEnrollmentDate
                    : undefined;
                freeTrialEndDate = contract?.overridesForOffering?.freeTrialEndDate
                    ? contract?.overridesForOffering?.freeTrialEndDate
                    : freeTrialEndDate;
                const updatedOfferingCustomer = new ReadCustomerResponseData(
                    {
                        ...customer,
                        offeringEnrollmentDate,
                        freeTrialEndDate,
                        freeTrialStartDate:
                            !customer?.freeTrialStartDate && freeTrialEndDate
                                ? new Date().toISOString()
                                : customer?.freeTrialStartDate,
                    },
                    [],
                    contract,
                );
                await this.enrollCustomerInContract(contract, subject, updatedOfferingCustomer);
                freeTrialStartDate = updatedOfferingCustomer?.freeTrialStartDate;
                prepaidCredit = contract?.prepaidCredit;
            }
            return {
                message: 'Successfully changed customer contract',
                freeTrialEndDate,
                freeTrialStartDate,
                offeringEnrollmentDate,
                prepaidCredit,
            };
        }
    }
}
