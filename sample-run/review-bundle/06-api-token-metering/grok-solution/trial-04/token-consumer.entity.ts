import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service';
import { MeteringCoToken } from '../dto/meteringcoToken.dto';
import { MeteringCoTokenMetadata } from '../dto/MeteringCoTokenMetadata';

export class TokenConsumer {
    public static _measurement = 'tokenConsumer';
    public static periodCloseMeasurement = 'tokenPeriodClose';
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
        point.timestamp(new Date(tokenConsumer.timestamp));
        point.tag('customerId', tokenConsumer.customerId);
        point.tag('businessID', tokenConsumer.saasCustomerAssociatedBusinessID);
        if (tokenConsumer.saasCustomerBusinessID) {
            point.tag('saasCustomerBusinessID', tokenConsumer.saasCustomerBusinessID);
        }
        point.floatField('tokenAmount', parseFloat(tokenConsumer.tokenAmount));
        if (tokenConsumer.metadata) {
            Object.keys(tokenConsumer.metadata).forEach((key) => {
                if (tokenConsumer.metadata[key] !== undefined && tokenConsumer.metadata[key] !== null) {
                    point.tag(key, String(tokenConsumer.metadata[key]));
                }
            });
        }
        return [point];
    }

    static periodCloseTransformer(
        {
            customerId,
            businessID,
            startDate,
            endDate,
        }: { customerId: string; businessID: string; startDate: Date; endDate: Date },
        influxService: InfluxService,
    ): Array<Point> {
        const point = influxService.getPoint(TokenConsumer.periodCloseMeasurement);
        point.timestamp(startDate);
        point.tag('customerId', customerId);
        point.tag('businessID', businessID);
        point.tag('startDate', startDate.toISOString());
        point.tag('endDate', endDate.toISOString());
        point.intField('closed', 1);
        return [point];
    }
}
