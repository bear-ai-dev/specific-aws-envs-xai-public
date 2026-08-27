import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service.js';
import { MeteringCoToken } from '../dto/meteringcoToken.dto';
import { MeteringCoTokenMetadata } from 'token-consumer/dto/MeteringCoTokenMetadata';

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

    static transformer(tokenConsumer: TokenConsumer, influxService: InfluxService): Array<Point> {
        const point = influxService.getPoint(TokenConsumer._measurement);
        point.tag('customerId', tokenConsumer.customerId);
        point.tag('businessID', tokenConsumer.saasCustomerAssociatedBusinessID);
        point.tag('saasCustomerBusinessID', tokenConsumer.saasCustomerBusinessID);
        point.floatField('tokenAmount', parseFloat(tokenConsumer.tokenAmount));
        if (tokenConsumer.timestamp) {
            point.timestamp(new Date(tokenConsumer.timestamp));
        }
        if (tokenConsumer.metadata) {
            Object.keys(tokenConsumer.metadata).forEach((key) => {
                if (tokenConsumer.metadata[key] !== undefined && tokenConsumer.metadata[key] !== null) {
                    point.tag(`metadata_${key}`, tokenConsumer.metadata[key].toString());
                }
            });
        }
        return [point];
    }
}
