import { Injectable, Logger } from '@nestjs/common';
import { CreateMeasurementDto } from './dto/createMeasurement.dto';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { InfluxService } from '../influx/influx.service';
import { MeasurementEntity } from './entities/measurement.entity';
import { ReadMeasurementDTO } from './dto/readMeasurements.dto';
import { CreateDimensionDto } from '../dimensions/dto/create-dimension.dto';

@Injectable()
export class MeasurementService {
    private static readonly logger = new Logger(MeasurementService.name);
    constructor(readonly InfluxService: InfluxService) {}

    async create(createMeasurementDto: CreateMeasurementDto) {
        // Add Measurement to Influx
        const { loadPoints } = this.InfluxService;
        const pricingModel = new MeasurementEntity(createMeasurementDto);
        const dbModel = MeasurementEntity.transformer(pricingModel, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-usage-data`, 'meteringco', dbModel);
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
                })
            ),
            message: 'Found Measurements',
        };
    }

    async remove({ startTime, endTime, infrastructureType, businessID }) {
        await this.InfluxService.dropMeasurementsBetweenDateRanges(`${process.env.STAGE}-usage-data`, 'meteringco', {
            startTime,
            endTime,
            infrastructureType,
            businessID,
        });
        return { message: 'removed measurements' };
    }
}
