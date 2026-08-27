import { ConflictException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { BasicResponseDTO } from '../basicResponseDTO';
import { CustomerService } from '../customer/customer.service';
import { QueryParamUsageDto } from '../customer/dto/read-customer.dto';

import { DimensionsService } from '../dimensions/dimensions.service';
import { InfluxService } from '../influx/influx.service';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';

import { MeasurementConfigService } from '../measurement-config/measurement-config.service';
import { OfferingService } from '../offering/offering.service';
import { CreateUsageDto } from './dto/create-usage.dto';
import { ReadUsageForCustomerDto } from './dto/read-usage.dto';
import { UsageEntity } from './entities/usage.entity';

const ONE_DAY_IN_MS = 864e5;
@Injectable()
export class UsageService {
    private static readonly logger = new Logger(UsageService.name);
    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
        @Inject(forwardRef(() => MeasurementConfigService)) readonly measurementConfigService: MeasurementConfigService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionService: DimensionsService,
        @Inject(forwardRef(() => CustomerService)) readonly customerService: CustomerService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService
    ) {}
    findAll() {
        return `This action returns all usage`;
    }

    async findUsageForCustomer({ customerId, businessID }: ReadUsageForCustomerDto, overrides: QueryParamUsageDto) {
        const {
            data: [{ offering }],
        } = await this.customerService.findOne({ customerId, businessID });
        if (offering) {
            const { dimensions, ...restOfOfferingDoc } = offering;
            let setDimensions = dimensions;
            if (overrides?.aggregationInterval) {
                setDimensions = dimensions.map((dimension) => ({
                    ...dimension,
                    aggregationInterval: overrides.aggregationInterval,
                }));
            }
            const startDate = new Date(Date.now() - ONE_DAY_IN_MS);
            const endDate = new Date();

            UsageService.logger.debug(`Gathering Usage for businessID: ${businessID} and customerId: ${customerId}`);
            const aggregateData = await this.influxService.getAggregateUsageForDimension({
                customerId,
                businessID,
                startTime: overrides?.startTime ? overrides?.startTime : startDate.toISOString(),
                endTime: overrides?.endTime ? overrides?.endTime : endDate.toISOString(),
                influxService: this.influxService,
                clientID: customerId,
                offeringDocument: { dimensions: setDimensions, ...restOfOfferingDoc },
            });
            return aggregateData;
        } else {
            throw new ConflictException('No offering found for customer cannot get usage');
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
