import { ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InfluxService } from '../influx/influx.service';
import {
    CreateDimensionDto,
    CreateDimensionResponse,
    SampleType,
    aggregationInterval,
    aggregationMethod,
    infrastructureType,
} from './dto/create-dimension.dto';
import { DeleteDimensionDto } from './dto/deleteDimension.dto';
import { ReadDimensionDto, ReadDimensionResponse, ReadDimensionResponseData } from './dto/read-dimension.dto';
import { v4 } from 'uuid';
import { aggregationType, DimensionEntity, numericalType } from './entities/dimensions.entity';
import { BasicResponseDTO } from '../basicResponseDTO';
import { UpdateDimensionDto } from './dto/update-dimension.dto';
import { MeasurementConfigService } from '../measurement-config/measurement-config.service';
import { OfferingService } from '../offering/offering.service';
import { ServicesService } from '../services/services.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import {
    InfrastructureAccessInformation,
    SupportedResources,
} from '../measurement-config/entities/measurement-config.entity';
import { schedulerType, SchedulerStatus, SupportedMeasurementFrequencies } from '../scheduler/dto/scheduler.dto';
import { AggregationDto } from './dto/aggregation.dto';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { measurementMode } from '../measurement-config/dto/create-measurement-config.dto';

@Injectable()
export class DimensionsService {
    private static readonly logger = new Logger(DimensionsService.name);
    constructor(
        readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => MeasurementConfigService)) readonly measurementConfigService: MeasurementConfigService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService,
        @Inject(forwardRef(() => ServicesService)) readonly servicesService: ServicesService,
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService
    ) {}
    async create(createDimensionDto: CreateDimensionDto, subject): Promise<CreateDimensionResponse> {
        const dimensionId = v4();
        // create the Points and commit it
        const { loadPoints } = this.InfluxService;
        const { measurementId, businessID } = createDimensionDto;
        let inputForEntity;
        const inputForAggregationSchedule = this.determineAggregationScheduleInput(dimensionId, businessID);
        if (measurementId) {
            inputForEntity = await this.measurementConfigService.createMeasurementConfig(
                createDimensionDto,
                measurementId,
                createDimensionDto.businessID,
                dimensionId
            );
        } else {
            inputForEntity = this.transformDtoToEntityInput(createDimensionDto, dimensionId);
        }
        DimensionsService.logger.debug(`Input for Entity`, JSON.stringify(inputForEntity));
        const dimensionModel = new DimensionEntity(inputForEntity);
        const dbModel = DimensionEntity.transformer(dimensionModel, this.InfluxService);

        await loadPoints(`${process.env.STAGE}-config`, 'meteringco', [dbModel]);

        await this.schedulerService.create({
            schedulerID: dimensionId,
            schedulerType: schedulerType.aggregation,
            schedulerStatus: SchedulerStatus.live,
            scheduleParameters: inputForAggregationSchedule,
            rate: inputForAggregationSchedule.rate,
            subject,
            businessID,
        });
        if (measurementId) {
            const {
                data: [{ measurementMode: argumentMeasurementMode, measurementConfiguration }],
            } = await this.measurementConfigService.findOne({ measurementId, businessID });
            if (argumentMeasurementMode === measurementMode.infrastructureBased) {
                const accessInformation = measurementConfiguration as InfrastructureAccessInformation;
                await this.schedulerService.create({
                    schedulerID: this.createKeyForManagedInfraDimensionSchedule({
                        dimensionId,
                        resourceType: accessInformation.resourceType,
                    }),
                    schedulerType: schedulerType.dimensionDataGathering,
                    schedulerStatus: SchedulerStatus.live,
                    scheduleParameters: {
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        //@ts-ignore
                        dimensionType: this.ressourceTypeToDimensionType(accessInformation.resourceType),
                        dimensionId,
                        businessID,
                        rate: SupportedMeasurementFrequencies.everyFiveMinutes,
                        iamRoleArn: accessInformation?.iamRoleArn,
                        externalId: accessInformation?.externalId,
                        region: accessInformation?.region,
                    },
                    rate: SupportedMeasurementFrequencies.everyFiveMinutes,
                    subject,
                    businessID,
                });
            }
        }

        return { message: 'created dimension document', dimensionId };
    }
    private createKeyForManagedInfraDimensionSchedule({ dimensionId, resourceType }) {
        return `${dimensionId}-${resourceType}`;
    }
    private ressourceTypeToDimensionType(ressourceType: SupportedResources): infrastructureType {
        if (ressourceType === SupportedResources.ebssnapshot) {
            return infrastructureType.ebsSnapshot;
        }
        if (ressourceType === SupportedResources.ebs) {
            return infrastructureType.ebsVolumeProvisionedCapacity;
        }
        if (ressourceType === SupportedResources.k8sPod) {
            return infrastructureType.podCPUHours;
        }
        if (ressourceType === SupportedResources.ec2) {
            return infrastructureType.instanceRunningTime;
        }
        if (ressourceType === SupportedResources.ec2Egress) {
            return infrastructureType.ec2Egress;
        }
    }

    async findAll({ businessID }): Promise<ReadDimensionResponse> {
        const dimensionIds = await this.InfluxService.getAllDimensionIds({ businessID });
        const errors = [];
        const results = await Promise.all(
            dimensionIds.map(async ({ dimensionId }) => {
                try {
                    const {
                        data: [readDimensionData],
                    } = await this.findOne({ businessID, dimensionId });
                    return readDimensionData;
                } catch (error) {
                    if (error.status === 404) {
                        // If a subset of documents are missing then catch the error and continue
                        // This realistically should never happen, since we are gathering all the ids from the same DB, but you never know
                        errors.push(error.message);
                    } else {
                        throw error;
                    }
                }
            })
        );
        if (errors.length) {
            DimensionsService.logger.log(`Errors occured in find all dimensions, likely some Ids were disconnected`);
            DimensionsService.logger.error(errors);
        }
        const filtered = results.filter((r) => r);
        if (results.length && results.length > 0) {
            return { data: filtered, message: 'Found Dimensions' };
        } else {
            return { data: [], message: 'No Dimensions found' };
        }
    }

    async findOne({
        businessID,
        dimensionId,
    }: ReadDimensionDto): Promise<{ data: ReadDimensionResponseData[]; message: string }> {
        const { getSingleDimension } = this.InfluxService;
        const dbModel = await getSingleDimension({ businessID, dimensionId });
        if (dbModel.length) {
            const entity = DimensionEntity.dbModelToEntity(dbModel[0]);
            let measurementData;
            if (entity?.measurementId) {
                try {
                    const {
                        data: [measurementInfo],
                    } = await this.measurementConfigService.findOne({
                        measurementId: entity.measurementId,
                        businessID,
                    });
                    measurementData = measurementInfo;
                } catch (error) {
                    if (error instanceof NotFoundException) {
                        AuditService.publishEvent({
                            message: 'Measurement not found for dimension',
                            data: [{ dimensionId, measurementId: entity.measurementId }],
                            topic: AuditScope.ERROR,
                        });
                    } else {
                        throw error;
                    }
                }
            }
            const { measurementId, ...rest } = new CreateDimensionDto(entity);

            return {
                data: [
                    {
                        dimensionId: entity.dimensionId,
                        ...rest,
                        ...(measurementData && { measurement: { ...measurementData } }),
                    },
                ],
                message: 'Found Dimension',
            };
        } else {
            throw new NotFoundException(`No Dimensions found with ID:${dimensionId}`);
        }
    }

    async remove(deleteDimensionDto: DeleteDimensionDto): Promise<BasicResponseDTO> {
        const { dimensionId, businessID } = deleteDimensionDto;
        const {
            data: [{ measurement }],
        } = await this.findOne({ dimensionId, businessID });
        try {
            const { data: offeringIds } = await this.offeringService.findOfferingIdsByDimensionId({
                dimensionId,
                businessID,
            });
            if (offeringIds.length) {
                throw new ConflictException(
                    `Cannot Delete Dimensions when they are attached to Offerings, remove dimensions from offerings before deleting. Current OfferingIds using the dimension: ${offeringIds.reduce(
                        (acc, item) => {
                            acc += `${item}   `;
                            return acc;
                        },
                        ''
                    )} `
                );
            }
        } catch (error) {
            if (error instanceof NotFoundException) {
                // Ignore
            } else {
                throw error;
            }
        }

        if (measurement) {
            try {
                await this.schedulerService.remove({ schedulerID: dimensionId, businessID });
                if (measurement.measurementMode === measurementMode.infrastructureBased) {
                    const accessInformation = measurement?.measurementConfiguration as InfrastructureAccessInformation;
                    await this.schedulerService.remove({
                        schedulerID: this.createKeyForManagedInfraDimensionSchedule({
                            dimensionId,
                            resourceType: accessInformation.resourceType,
                        }),
                        businessID,
                    });
                }
            } catch (e) {
                AuditService.publishEvent({
                    data: [e],
                    message: 'Error removing measurement dimension from scheduler',
                    topic: AuditScope.ERROR,
                });
            }
        }

        try {
            await this.schedulerService.remove({
                schedulerID: dimensionId,
                businessID,
            });
        } catch (e) {
            AuditService.publishEvent({
                data: [e],
                message: 'Error removing dimension from scheduler',
                topic: AuditScope.ERROR,
            });
        }
        await this.InfluxService.dropDimensionConfig(`${process.env.STAGE}-config`, 'meteringco', businessID, dimensionId);
        return { message: 'deleted dimension document' };
    }
    async update(
        { dimensionId, businessID, ...updatedFields }: UpdateDimensionDto,
        subject: string
    ): Promise<CreateDimensionResponse> {
        DimensionsService.logger.log('Updating a Dimension');
        const {
            data: [{ ...rest }],
        } = await this.findOne({ dimensionId, businessID });

        const { loadPoints } = this.InfluxService;
        const input = this.transformDtoToEntityInput({ ...rest, ...updatedFields, businessID }, dimensionId);
        const entity = new DimensionEntity(input);
        const dimensionDBModel = DimensionEntity.transformer(entity, this.InfluxService);
        if (updatedFields.measurementId) {
            // Check to see if measurement exists
            const {
                data: [measurement],
            } = await this.measurementConfigService.findOne({
                measurementId: updatedFields.measurementId,
                businessID,
            });
            if (measurement.measurementMode === measurementMode.infrastructureBased) {
                const accessInformation = measurement?.measurementConfiguration as InfrastructureAccessInformation;
                try {
                    DimensionsService.logger.log('Creating new schedules for data gathering for the Dimension');
                    await this.schedulerService.remove({
                        schedulerID: this.createKeyForManagedInfraDimensionSchedule({
                            dimensionId,
                            resourceType: accessInformation.resourceType,
                        }),
                        businessID,
                    });
                } catch (e) {
                    AuditService.publishEvent({
                        data: [e],
                        message: `Error removing dimension from scheduler: dimensionId: ${dimensionId}`,
                        topic: AuditScope.ERROR,
                    });
                }
                try {
                    await this.schedulerService.create({
                        schedulerID: this.createKeyForManagedInfraDimensionSchedule({
                            dimensionId,
                            resourceType: accessInformation.resourceType,
                        }),
                        schedulerType: schedulerType.dimensionDataGathering,
                        schedulerStatus: SchedulerStatus.live,
                        scheduleParameters: {
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            //@ts-ignore
                            dimensionType: this.ressourceTypeToDimensionType(accessInformation.resourceType),
                            dimensionId,
                            businessID,
                            rate: SupportedMeasurementFrequencies.everyFiveMinutes,
                            iamRoleArn: accessInformation?.iamRoleArn,
                            externalId: accessInformation?.externalId,
                        },
                        rate: SupportedMeasurementFrequencies.everyHour,
                        subject,
                        businessID,
                    });
                } catch (e) {
                    AuditService.publishEvent({
                        data: [e],
                        message: `Error adding schedule for dimension: ${dimensionId}`,
                        topic: AuditScope.ERROR,
                    });
                }
            }
        }

        await loadPoints(`${process.env.STAGE}-config`, 'meteringco', [dimensionDBModel]);
        return { message: 'Loaded Dimension Update', dimensionId: entity.dimensionId };
    }
    async removeAll(deleteDimensionDto): Promise<BasicResponseDTO> {
        const { businessID } = deleteDimensionDto;
        const dimensionIds = await this.InfluxService.getAllDimensionIds({ businessID });
        await Promise.all(
            dimensionIds.map(async ({ dimensionId }) => {
                await this.InfluxService.dropDimensionConfig(
                    `${process.env.STAGE}-config`,
                    'meteringco',
                    businessID,
                    dimensionId
                );
            })
        );

        return { message: 'deleted dimension document' };
    }

    async findByMeasurementId({ measurementId, businessID }) {
        const results = await this.InfluxService.getAllDimensionIdsWithMeasurementId({ businessID, measurementId });
        const dimensions = await Promise.all(
            results.map(async ({ dimensionId }) => {
                const {
                    data: [{ ...rest }],
                } = await this.findOne({ dimensionId, businessID });
                return rest;
            })
        );
        const mostRecentElementInLedger = dimensions.filter(({ measurement }) => {
            if (measurement && measurement.measurementId === measurementId) {
                return true;
            } else {
                return false;
            }
        });

        return mostRecentElementInLedger.map(({ dimensionId }) => dimensionId);
    }
    public transformDtoToEntityInput(
        createDimensionDto: ReadDimensionResponseData | CreateDimensionDto,
        dimensionId
    ): DimensionEntity {
        const {
            consumptionUnit,
            dimensionName,
            usageIncrement,
            rounding,
            usageEntitlement,
            overageAllowed,
            consumptionPrice,
            businessID,
            aggregationInterval: argumentAggregationInternal,
            aggregationMethod: argumentAggregationMethod,
        } = createDimensionDto;
        let measurementId;

        //eslint-disable-next-line
        //@ts-ignore
        if (createDimensionDto?.measurement?.measurementId) {
            //eslint-disable-next-line
            //@ts-ignore
            measurementId = createDimensionDto?.measurement?.measurementId;
        } else {
            //eslint-disable-next-line
            //@ts-ignore
            measurementId = createDimensionDto?.measurementId;
        }
        const input = {
            typeofDimension: 'numerical',
            numerical: {
                numericalType: numericalType['int'],
                dimensionUnit: consumptionUnit.unit,
                dimensionUnitType: consumptionUnit.type.toLowerCase(),
                aggregationInterval: argumentAggregationInternal
                    ? argumentAggregationInternal
                    : aggregationInterval['Hour'],
                aggregationMethod: argumentAggregationMethod ? argumentAggregationMethod : aggregationMethod['max'],
                priceSegments: [
                    {
                        lowerLimit: '0',
                        upperLimit: 'inf',
                        price: consumptionPrice,
                    },
                ],
                sampleType: SampleType['gauge'],
                usageIncrement,
                rounding,
                usageEntitlement,
                overageAllowed,
            },
            businessID,
            dimensionId,
            dimensionName,
            categorical: {},
            measurementId,
        };
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        return input;
    }
    private determineAggregationScheduleInput(dimensionId, businessID: string): AggregationDto {
        return {
            dimensionId,
            businessID,
            rate: SupportedMeasurementFrequencies.daily,
            aggregationType: aggregationType.aggregation,
        };
    }
}
