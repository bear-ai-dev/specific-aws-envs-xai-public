import { Injectable, Logger } from '@nestjs/common';
import { CreateFeatureRequestDto } from './dto/createFeatureRequest.dto.js';
import { InfluxService } from '../influx/influx.service.js';
import { FeatureRequestEntity } from './entities/featureRequest.entity.js';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth('bearer')
@Injectable()
export class FeatureRequestService {
    private static readonly logger = new Logger(FeatureRequestService.name);
    constructor(readonly InfluxService: InfluxService) {}
    async create({
        votes = 1,
        featureName,
        metadata,
    }: CreateFeatureRequestDto): Promise<{ message: string; featureName: string }> {
        const { loadPoints } = this.InfluxService;
        const featureRequestModel = new FeatureRequestEntity({ votes, featureName, metadata });
        const dbModel = FeatureRequestEntity.transformer(featureRequestModel, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-usage-data`, process.env.INFLUX_ORG, dbModel);
        return { message: 'Loaded Vote', featureName };
    }

    async findOne(featureName: string): Promise<{ votes: number; featureName: string }> {
        const [response] = await this.InfluxService.getFeatureSumByName(featureName);

        return { votes: response?._value, featureName };
    }
}
