import { ConflictException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { CustomerService } from '../customer/customer.service.js';
import { QueryParamUsageDto } from '../customer/dto/read-customer.dto.js';

import { DimensionsService } from '../dimensions/dimensions.service.js';
import { InfluxService } from '../influx/influx.service.js';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity.js';

import { MeasurementConfigService } from '../measurement-config/measurement-config.service.js';
import { OfferingService } from '../offering/offering.service.js';
import { CreateUsageDto } from './dto/create-usage.dto.js';
import { ReadUsageForCustomerDto } from './dto/read-usage.dto.js';
import { UsageEntity } from './entities/usage.entity.js';
import { aggregationInterval } from '../dimensions/dto/create-dimension.dto.js';
import { DatetimeUtils } from '../utils/datetime.js';

const ONE_DAY_IN_MS = 864e5;
@Injectable()
export class UsageService {
    private static readonly logger = new Logger(UsageService.name);
    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
        @Inject(forwardRef(() => MeasurementConfigService)) readonly measurementConfigService: MeasurementConfigService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionService: DimensionsService,
        @Inject(forwardRef(() => CustomerService)) readonly customerService: CustomerService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService,
    ) {}
    findAll() {
        return `This action returns all usage`;
    }

    async findUsageForCustomer(
        { customerId, businessID, customer }: ReadUsageForCustomerDto,
        overrides: QueryParamUsageDto,
    ) {
        let offering;
        if (customer === undefined) {
            const {
                data: [{ offering: readOffering }],
            } = await this.customerService.findOne({ customerId, businessID });
            offering = readOffering;
        } else {
            offering = customer.offering;
        }
        if (offering) {
            const { dimensions, ...restOfOfferingDoc } = offering;
            let setDimensions = dimensions;
            if (overrides?.aggregationInterval) {
                setDimensions = dimensions.map((dimension) => ({
                    ...dimension,
                    aggregationInterval: overrides.aggregationInterval,
                }));
            }
            let endDate: string;
            let startTime: string;
            if (overrides?.aggregationInterval === aggregationInterval.month) {
                endDate = DatetimeUtils.endOfDay(DatetimeUtils.getLastDayOfMonthGivenDate(new Date())).toISOString();
                startTime = DatetimeUtils.getStartOfMonthGivenDate(new Date()).toISOString();
            } else {
                endDate = new Date().toISOString();
                startTime = new Date(Date.now() - ONE_DAY_IN_MS).toISOString();
            }
            UsageService.logger.debug(`Gathering Usage for businessID: ${businessID} and customerId: ${customerId}`);
            const aggregateData = await this.influxService.getAggregateUsageForDimension({
                customerId,
                businessID,
                startTime: overrides?.startTime ? overrides?.startTime : startTime,
                endTime: overrides?.endTime ? overrides?.endTime : endDate,
                influxService: this.influxService,
                clientID: customerId,
                offeringDocument: { dimensions: setDimensions, ...restOfOfferingDoc },
                aggregationPurpose: overrides?.aggregationPurpose,
            });
            return aggregateData;
        } else {
            return [];
        }
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
