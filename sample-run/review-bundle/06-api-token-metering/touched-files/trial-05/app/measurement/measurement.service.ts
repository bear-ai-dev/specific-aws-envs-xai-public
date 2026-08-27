import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { CreateMeasurementDto } from './dto/createMeasurement.dto.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { InfluxService } from '../influx/influx.service.js';
import { MeasurementEntity } from './entities/measurement.entity.js';
import { ReadMeasurementDTO } from './dto/readMeasurements.dto.js';
import { CreateDimensionDto } from 'dimensions/dto/create-dimension.dto.js';
import { TokenConsumerService } from '../token-consumer/token-consumer.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class MeasurementService {
    private static readonly logger = new Logger(MeasurementService.name);
    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => TokenConsumerService)) readonly tokenConsumerService: TokenConsumerService,
    ) {}

    async create(createMeasurementDto: CreateMeasurementDto) {
        // Add Measurement to Influx
        const { loadPoints } = this.InfluxService;
        const pricingModel = new MeasurementEntity(createMeasurementDto);
        const dbModel = MeasurementEntity.transformer(pricingModel, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-usage-data`, process.env.INFLUX_ORG, dbModel);
        void this.tokenConsumerService.registerApiCall({
            businessID: createMeasurementDto.businessID,
            amount: 0.001,
            moment: new Date(),
            metadata: TokenConsumerService.buildCallMetadata({ uuid: randomUUID() }),
        });
        return { message: 'Added Measurement' };
    }

    async findAll({ startTime, endTime, infrastructureType, businessID }: ReadMeasurementDTO) {
        MeasurementService.logger.debug('Querying for Metrics', { startTime, endTime, infrastructureType, businessID });
        return {
            data: ReadMeasurementDTO.getMeasurmentDTO(
                await this.InfluxService.getMeasurementsBetweenDateRange({
                    startTime,
                    endTime,
                    infrastructureType,
                    businessID,
                }),
            ),
            message: 'Found Measurements',
        };
    }

    async remove({ startTime, endTime, infrastructureType, businessID }) {
        await this.InfluxService.dropMeasurementsBetweenDateRanges(
            `${process.env.STAGE}-usage-data`,
            process.env.INFLUX_ORG,
            {
                startTime,
                endTime,
                infrastructureType,
                businessID,
            },
        );
        return { message: 'removed measurements' };
    }
}
