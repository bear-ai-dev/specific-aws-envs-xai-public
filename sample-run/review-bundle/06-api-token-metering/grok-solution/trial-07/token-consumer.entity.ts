import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service';
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

    static transformer(tokenConsumer: TokenConsumer, influxService: InfluxService): Array<Point> {
        const point = influxService.getPoint(TokenConsumer._measurement);
        point.tag('customerId', tokenConsumer.customerId);
        point.tag('businessID', tokenConsumer.saasCustomerAssociatedBusinessID);
        point.tag('saasCustomerBusinessID', tokenConsumer.saasCustomerBusinessID);
        if (tokenConsumer.metadata) {
            Object.keys(tokenConsumer.metadata).forEach((key) => {
                if (tokenConsumer.metadata[key] !== undefined && tokenConsumer.metadata[key] !== null) {
                    point.tag(key, tokenConsumer.metadata[key].toString());
                }
            });
        }
        if (tokenConsumer.timestamp) {
            point.timestamp(new Date(tokenConsumer.timestamp));
        }
        const amount = parseFloat(tokenConsumer.tokenAmount);
        point.floatField('recordValue', Number.isFinite(amount) ? amount : 0);
        return [point];
    }
}
