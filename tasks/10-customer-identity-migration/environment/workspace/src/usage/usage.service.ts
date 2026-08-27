import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { BasicResponseDTO } from '../basicResponseDTO';

import { DimensionsService } from '../dimensions/dimensions.service';
import { aggregationInterval } from '../dimensions/dto/create-dimension.dto';
import { InfluxService } from '../influx/influx.service';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';

import { MeasurementConfigService } from '../measurement-config/measurement-config.service';
import { OfferingService } from '../offering/offering.service';
import { QueryParamUsageDto } from '../services/dto/readService.dto';
import { ServicesService } from '../services/services.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { ReadUsageForServiceDto } from './dto/read-usage.dto';
import { UsageEntity } from './entities/usage.entity';

const ONE_DAY_IN_MS = 864e5;
@Injectable()
export class UsageService {
    private static readonly logger = new Logger(UsageService.name);
    constructor(
        readonly influxService: InfluxService,
        @Inject(forwardRef(() => MeasurementConfigService)) readonly measurementConfigService: MeasurementConfigService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionService: DimensionsService,
        @Inject(forwardRef(() => ServicesService)) readonly servicesService: ServicesService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService
    ) {}
    findAll() {
        return `This action returns all usage`;
    }

    async findUsageForService({ serviceId, businessID }: ReadUsageForServiceDto, overrides: QueryParamUsageDto) {
        const {
            data: [
                {
                    offering: { dimensions, ...restOfOfferingDoc },
                    customer: { customerId },
                    applicationId,
                },
            ],
        } = await this.servicesService.findOne({ serviceId, businessID });
        let setDimensions = dimensions;
        if (overrides?.aggregationInterval) {
            setDimensions = dimensions.map((dimension) => ({
                ...dimension,
                aggregationInterval: overrides.aggregationInterval,
            }));
        }
        const startDate = new Date(Date.now() - ONE_DAY_IN_MS);
        const endDate = new Date();

        UsageService.logger.debug(`Gathering Usage for businessID: ${businessID} and serviceId: ${serviceId}`);
        const aggregateData = await this.influxService.getAggregateUsageForDimension({
            serviceId,
            businessID,
            startTime: overrides?.startTime ? overrides?.startTime : startDate.toISOString(),
            endTime: overrides?.endTime ? overrides?.endTime : endDate.toISOString(),
            influxService: this.influxService,
            clientID: customerId,
            offeringDocument: { dimensions: setDimensions, ...restOfOfferingDoc },
            applicationId,
        });
        return aggregateData;
    }

    async create(createUsageDto: CreateUsageDto): Promise<BasicResponseDTO> {
        const entity = new StandardMeasurementEntity({
            ...createUsageDto,
            recordValue: parseFloat(createUsageDto?.recordValue),
            _measurement: UsageEntity._measurement,
        });
        StandardMeasurementEntity.publish(entity);
        return { message: 'Measurement created' };
    }
}
