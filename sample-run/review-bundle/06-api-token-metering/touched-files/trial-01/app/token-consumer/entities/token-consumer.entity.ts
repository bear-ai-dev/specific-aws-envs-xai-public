import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service.js';
import { MeteringCoToken } from '../dto/meteringcoToken.dto';
import { MeteringCoTokenMetadata } from '../dto/MeteringCoTokenMetadata';

export class TokenConsumer {
    public static _measurement = 'tokenConsumer';
    saasCustomerBusinessID: string;
    customerId: string;
    saasCustomerAssociatedBusinessID: string;
    tokenAmount: string;
    timestamp: string;
    metadata?: MeteringCoTokenMetadata;

    constructor(meteringcoToken: MeteringCoToken, customerId: string, saasCustomerAssociatedBusinessID: string) {
        if (meteringcoToken) {
            this.saasCustomerBusinessID = meteringcoToken.businessID;
            this.tokenAmount = meteringcoToken.tokenAmount;

            if (meteringcoToken.metadata) {
                this.metadata = meteringcoToken.metadata;
            }
            this.timestamp = meteringcoToken.timestamp;
            this.saasCustomerAssociatedBusinessID = saasCustomerAssociatedBusinessID;
            this.customerId = customerId;
        }
    }

    static transformer(entity: TokenConsumer, influxService: InfluxService): Point {
        const point = influxService.getPoint(TokenConsumer._measurement);
        point.tag('customerId', entity.customerId);
        point.tag('businessID', entity.saasCustomerAssociatedBusinessID);
        point.tag('saasCustomerBusinessID', entity.saasCustomerBusinessID);
        point.floatField('tokenAmount', parseFloat(entity.tokenAmount));
        if (entity.metadata) {
            Object.keys(entity.metadata).forEach((key) => {
                if (entity.metadata[key] !== undefined && entity.metadata[key] !== null) {
                    point.tag(`metadata_${key}`, String(entity.metadata[key]));
                }
            });
        }
        if (entity.timestamp) {
            point.timestamp(new Date(entity.timestamp));
        }
        return point;
    }
}
