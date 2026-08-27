import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service';
import { CreateFeatureRequestDto } from '../dto/createFeatureRequest.dto';

export class FeatureRequestEntity {
    public static _measurement = 'FeatureRequest';

    public featureName: string;

    public votes: number;

    public metadata: any;

    constructor({ featureName, votes, metadata }: CreateFeatureRequestDto) {
        this.featureName = featureName;
        this.votes = votes;
        this.metadata = metadata;
    }

    static transformer(featureRequestEntity: FeatureRequestEntity, influxService: InfluxService): Array<Point> {
        const featureRequestEntityPoint = influxService.getPoint(FeatureRequestEntity._measurement);
        featureRequestEntityPoint.intField('votes', featureRequestEntity.votes);
        featureRequestEntityPoint.tag('featureName', featureRequestEntity.featureName);

        if (featureRequestEntity.metadata) {
            Object.keys(featureRequestEntity.metadata).forEach((key) => {
                featureRequestEntityPoint.tag(key, featureRequestEntity.metadata[key].toString());
            });
        }

        // All Entity Transformers should return an array of points, keep logic consistent, even if there is only one element
        return [featureRequestEntityPoint];
    }
}
