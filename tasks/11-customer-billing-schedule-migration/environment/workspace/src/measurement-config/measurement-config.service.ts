import {
    BadRequestException,
    ConflictException,
    forwardRef,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    CreateMeasurementConfigDto,
    CreateMeasurementConfigurationResponse,
    measurementMode,
} from './dto/create-measurement-config.dto';
import { UpdateMeasurementConfigDto } from './dto/update-measurement-config.dto';
import { InfluxService } from '../influx/influx.service';
import {
    AgentAccessInformation,
    DatastoreAccessInformation,
    InfrastructureAccessInformation,
    MeasurementConfigEntity,
    SupportedAgentHostingPlatforms,
    SupportedResources,
} from './entities/measurement-config.entity';
import { v4 } from 'uuid';
import {
    ReadAllMeasurementConfigs,
    ReadMeasurementConfigDto,
    ReadMeasurementConfigResponse,
} from './dto/read-measurement-config.dto';
import {
    aggregationInterval,
    aggregationMethod,
    CreateDimensionDto,
    roundingEnum,
    SampleType,
} from '../dimensions/dto/create-dimension.dto';
import { DimensionsService } from '../dimensions/dimensions.service';

@Injectable()
export class MeasurementConfigService {
    private static readonly logger = new Logger(MeasurementConfigService.name);

    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionsService: DimensionsService
    ) {}

    async createMeasurementConfig(createDimensionDto: CreateDimensionDto, measurementId, businessID, dimensionId) {
        const {
            data: [{ measurementMode: argumentMeasurementMode, measurementConfiguration }],
        } = await this.findOne({ measurementId, businessID });
        this.validateIntelligentMeasurement(createDimensionDto, argumentMeasurementMode, measurementConfiguration);
        const { transformDtoToEntityInput } = this.dimensionsService;
        const entity = transformDtoToEntityInput(
            {
                ...createDimensionDto,
                businessID,
            },
            dimensionId
        );
        return entity;
    }

    async create(
        createMeasurementConfigDto: CreateMeasurementConfigDto,
        subject
    ): Promise<CreateMeasurementConfigurationResponse> {
        MeasurementConfigService.logger.log(
            'Creating Measurement Config with the following inputs',
            createMeasurementConfigDto
        );
        const {
            businessID,
            measurementMode: chosenMeasurementMode,
            measurementConfiguration,
            measurementName,
        } = createMeasurementConfigDto;

        const { loadPoints } = this.InfluxService;
        const measurementId = v4();

        let measurementConfigEntity = new MeasurementConfigEntity({
            measurementId,
            measurementMode: chosenMeasurementMode,
            measurementConfiguration,
            businessID,
            subject,
            measurementName,
        });
        const accessInformation = await MeasurementConfigEntity.setupAccessIfRequired(measurementConfigEntity);
        if (accessInformation) {
            measurementConfigEntity = new MeasurementConfigEntity({
                measurementId,
                measurementMode: chosenMeasurementMode,
                measurementConfiguration: { ...measurementConfiguration, ...accessInformation },
                businessID,
                subject,
                measurementName,
            });
        }
        const dbModel = MeasurementConfigEntity.transformer(measurementConfigEntity, this.InfluxService);

        await loadPoints(`${process.env.STAGE}-config`, 'meteringco', dbModel);
        MeasurementConfigService.logger.log('Loaded information into DB');

        return {
            message: 'Created Measurement Configuration',
            measurementId,
            iamRoleArn: measurementConfigEntity?.measurementConfiguration?.iamRoleArn,
            externalId: measurementConfigEntity?.measurementConfiguration?.externalId,
            //eslint-disable-next-line
            // @ts-ignore
            ingestion: measurementConfigEntity?.measurementConfiguration?.ingestion,
            //eslint-disable-next-line
            // @ts-ignore
            dlq: measurementConfigEntity?.measurementConfiguration?.dlq,
            //eslint-disable-next-line
            // @ts-ignore
            region: measurementConfigEntity?.measurementConfiguration?.region,
        };
    }

    async findAll({ businessID }: ReadAllMeasurementConfigs): Promise<ReadMeasurementConfigResponse> {
        MeasurementConfigService.logger.log(`Reading all measurements for businessID: ${businessID}`);
        const { readAllMeaurements } = this.InfluxService;
        const dbModels = await readAllMeaurements({ businessID });
        if (dbModels.length === 0) {
            return { message: 'No Measurements Found', data: [] };
        }

        const entities = dbModels.map((dbModel) => MeasurementConfigEntity.dbModelToEntity(dbModel));
        const filtered = entities.filter((e) => e);
        return ReadMeasurementConfigResponse.entityToReadResponse(filtered);
    }

    async findOne({ measurementId, businessID }: ReadMeasurementConfigDto) {
        MeasurementConfigService.logger.log('Reading Measurement for the following ID', measurementId);
        const { readMeasurementConfigData } = this.InfluxService;
        const dbModels = await readMeasurementConfigData({ measurementId, businessID });

        MeasurementConfigService.logger.log('Response from Influx for MeasurementConfig', JSON.stringify(dbModels));

        if (dbModels.length === 0) {
            throw new NotFoundException(`No Measurement Configuration found for ID: ${measurementId}`);
        }

        const entities = dbModels.map((dbModel) => MeasurementConfigEntity.dbModelToEntity(dbModel));

        return ReadMeasurementConfigResponse.entityToReadResponse(entities);
    }

    async update(
        {
            measurementId,
            businessID,
            measurementName: updatedMeasurementName,
            ...restOfUpdate
        }: UpdateMeasurementConfigDto,
        subject
    ): Promise<CreateMeasurementConfigurationResponse> {
        MeasurementConfigService.logger.log('Updating Measurement Config', {
            measurementId,
        });

        const {
            data: [createMeasurementConfigDto],
        } = await this.findOne({ measurementId, businessID });

        const oldMeasurementEntity = new MeasurementConfigEntity({
            ...createMeasurementConfigDto,
            businessID,
            measurementId,
            subject,
        });
        const {
            measurementMode: chosenMeasurementMode,
            measurementConfiguration: { ...rest },
            measurementName,
        } = createMeasurementConfigDto;
        if (
            restOfUpdate.measurementMode &&
            restOfUpdate.measurementMode.toLowerCase() !== chosenMeasurementMode.toLowerCase()
        ) {
            throw new BadRequestException(
                'Cannot Update Measurement Mode please create a new measurement and delete this one if you want to change the measurement mode'
            );
        }

        const { loadPoints } = this.InfluxService;
        const updatedMeasurementConfiguration = { ...rest, ...restOfUpdate?.measurementConfiguration };
        const measurementConfigEntity = new MeasurementConfigEntity({
            measurementId,
            measurementMode: chosenMeasurementMode,
            measurementConfiguration: updatedMeasurementConfiguration,
            businessID,
            subject,
            measurementName: updatedMeasurementName ? updatedMeasurementName : measurementName,
        });
        await MeasurementConfigEntity.updateAccessIfRequired(measurementConfigEntity, oldMeasurementEntity);
        const dbModel = MeasurementConfigEntity.transformer(measurementConfigEntity, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-config`, 'meteringco', dbModel);
        return {
            measurementId,
            message: 'Updated Measurement Configuration',
            iamRoleArn: measurementConfigEntity?.measurementConfiguration?.iamRoleArn,
            externalId: measurementConfigEntity?.measurementConfiguration?.externalId,
            //eslint-disable-next-line
            // @ts-ignore
            ingestion: measurementConfigEntity?.measurementConfiguration?.ingestion,
            //eslint-disable-next-line
            // @ts-ignore
            dlq: measurementConfigEntity?.measurementConfiguration?.dlq,
            //eslint-disable-next-line
            // @ts-ignore
            region: measurementConfigEntity?.measurementConfiguration?.region,
        };
    }

    async remove({ measurementId, businessID }) {
        MeasurementConfigService.logger.log(
            `Attempting to delete measurement config: ${measurementId} for ${businessID}`
        );
        const measurementDbModels = await this.InfluxService.readMeasurementConfigData({ businessID, measurementId });
        if (measurementDbModels.length) {
            const { loadPoints } = this.InfluxService;
            // Check to see if any active dimension has the measurement attached
            const dimensionIds = await this.dimensionsService.findByMeasurementId({ businessID, measurementId });
            if (dimensionIds.length) {
                throw new ConflictException(
                    `Measurement is currently attached to dimensions ${dimensionIds.reduce((acc, item) => {
                        acc += `  DimensionId: ${item}  `;
                        return acc;
                    }, '')}`
                );
            }
            const entity = MeasurementConfigEntity.dbModelToEntity(measurementDbModels[0]);
            entity.softDelete = true;
            entity.businessID = businessID;
            const points = MeasurementConfigEntity.transformer(entity, this.InfluxService);
            MeasurementConfigService.logger.log('Points to delete', points);

            await loadPoints(`${process.env.STAGE}-config`, `meteringco`, points);

            return { message: 'Deleted Measurement Config', measurementId: entity.measurementId };
        } else {
            throw new NotFoundException(`No Measurement configurations matching ID measurementId:${measurementId}`);
        }
    }

    private validateIntelligentMeasurement(dimension: CreateDimensionDto, mode: measurementMode, configuration): void {
        MeasurementConfigService.logger.log('Validating Intelligent Measurement: ', { dimension, mode, configuration });
        const {
            consumptionUnit: dimensionConsumptionUnit,
            usageIncrement: dimensionUsageIncrement,
            rounding: dimensionRounding,
            sampleType: dimensionSampleType,
            aggregationInterval: dimensionAggregationInterval,
            aggregationMethod: dimensionAggregationMethod,
        } = dimension;
        if (mode === measurementMode.infrastructureBased && configuration instanceof InfrastructureAccessInformation) {
            if (
                configuration.resourceType === SupportedResources.ebs ||
                configuration.resourceType === SupportedResources.ebssnapshot
            ) {
                if (dimensionConsumptionUnit?.type?.toLocaleLowerCase() !== 'data') {
                    throw new BadRequestException(
                        'Consumption Unit for EBS Volume and Snapshot Measurement must be Data type'
                    );
                }
                if (dimensionConsumptionUnit?.unit?.toLocaleLowerCase() !== 'gigabyte') {
                    throw new BadRequestException(
                        'Consumption Unit for EBS Volume and Snapshot Measurement must be gigabyte'
                    );
                }
                if (dimensionUsageIncrement !== 1) {
                    throw new BadRequestException('Usage Increment for EBS Volume and Snapshot Measurement must be 1');
                }
                if (dimensionRounding !== roundingEnum.ceiling) {
                    throw new BadRequestException('Rounding for EBS Volume and Snapshot Measurement must be Ceiling');
                }
                if (dimensionSampleType !== SampleType.gauge) {
                    throw new BadRequestException('Sample Type for EBS Volume and Snapshot Measurement must be Gauge');
                }
                if (dimensionAggregationInterval !== aggregationInterval.hour) {
                    throw new BadRequestException(
                        'Aggregation Interval for EBS Volume and Snapshot Measurement must be Hour'
                    );
                }
                if (dimensionAggregationMethod !== aggregationMethod.max) {
                    throw new BadRequestException(
                        'Aggregation Method for EBS Volume and Snapshot Measurement must be Max'
                    );
                }
            } else if (configuration.resourceType === SupportedResources.ec2Egress) {
                if (dimensionConsumptionUnit?.type?.toLocaleLowerCase() !== 'data') {
                    throw new BadRequestException('Consumption Unit for EC2 Egress must be Data type');
                }
                if (dimensionConsumptionUnit?.unit?.toLocaleLowerCase() !== 'byte') {
                    throw new BadRequestException('Consumption Unit for EC2 Egress Measurement must be byte');
                }
                if (dimensionUsageIncrement !== 1) {
                    throw new BadRequestException('Usage Increment for EC2 Egress Measurement must be 1');
                }
                if (dimensionRounding !== roundingEnum.ceiling) {
                    throw new BadRequestException('Rounding for EC2 Egress Measurement must be Ceiling');
                }
                if (dimensionSampleType !== SampleType.gauge) {
                    throw new BadRequestException('Sample Type for EC2 Egress Measurement must be Gauge');
                }
                if (dimensionAggregationInterval !== aggregationInterval.hour) {
                    throw new BadRequestException('Aggregation Interval for EC2 Egress Measurement must be Hour');
                }
                if (dimensionAggregationMethod !== aggregationMethod.sum) {
                    throw new BadRequestException('Aggregation Method for EC2 Egress Measurement must be Max');
                }
            } else if (configuration.resourceType === SupportedResources.ec2) {
                if (dimensionConsumptionUnit?.type?.toLocaleLowerCase() !== 'time') {
                    throw new BadRequestException(
                        'Consumption Unit for EC2 Running Time Measurement must be Time type'
                    );
                }
                if (dimensionConsumptionUnit?.unit?.toLocaleLowerCase() !== 'hour') {
                    throw new BadRequestException('Consumption Unit for EC2 Running Time Measurement must be Hour');
                }
                if (dimensionUsageIncrement !== 1) {
                    throw new BadRequestException('Usage Increment for EC2 Running Time Measurement must be 1');
                }
                if (dimensionRounding !== roundingEnum.ceiling) {
                    throw new BadRequestException('Rounding for EC2 Running Time Measurement must be Ceiling');
                }
                if (dimensionSampleType !== SampleType.gauge) {
                    throw new BadRequestException('Sample Type for EC2 Running Time Measurement must be Gauge');
                }
                if (dimensionAggregationInterval !== aggregationInterval.hour) {
                    throw new BadRequestException('Aggregation Interval for EC2 Running Time Measurement must be Hour');
                }
                if (dimensionAggregationMethod !== aggregationMethod.sum) {
                    throw new BadRequestException('Aggregation Method for EC2 Running Time Measurement must be Sum');
                }
            }
        } else if (mode === measurementMode.agentBased && configuration instanceof AgentAccessInformation) {
            if (configuration.hostingPlatform === SupportedAgentHostingPlatforms.eks) {
                if (dimensionConsumptionUnit?.type?.toLocaleLowerCase() !== 'time') {
                    throw new BadRequestException(
                        'Consumption Unit for EKS pod running time Measurement must be Time type'
                    );
                }
                if (dimensionConsumptionUnit?.unit?.toLocaleLowerCase() !== 'hour') {
                    throw new BadRequestException('Consumption Unit for EKS pod running time Measurement must be Hour');
                }
                if (dimensionUsageIncrement !== 1) {
                    throw new BadRequestException('Usage Increment for EKS pod running time Measurement must be 1');
                }
                if (dimensionRounding !== roundingEnum.ceiling) {
                    throw new BadRequestException('Rounding for EKS pod running time Measurement must be Ceiling');
                }
                if (dimensionSampleType !== SampleType.gauge) {
                    throw new BadRequestException('Sample Type for EKS pod running time Measurement must be Gauge');
                }
                if (dimensionAggregationInterval !== aggregationInterval.hour) {
                    throw new BadRequestException(
                        'Aggregation Interval for EKS pod running time Measurement must be Hour'
                    );
                }
                if (dimensionAggregationMethod !== aggregationMethod.sum) {
                    throw new BadRequestException(
                        'Aggregation Method for EKS pod running time Measurement must be Sum'
                    );
                }
            }
        } else if (mode === measurementMode.datastoreBased && configuration instanceof DatastoreAccessInformation) {
            // No validation required
        } else {
            throw new BadRequestException(
                `Invalid Measurement Mode and Configurations combination. Mode: ${mode}, Configurations: ${JSON.stringify(
                    configuration,
                    null,
                    2
                )}`
            );
        }
    }
}
