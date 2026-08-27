import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service';
import { MeasurementFormat } from '../../measurement-config/entities/measurement.interface';
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
    dimensionId?: string;

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

    static toMeasurementFormat({
        customerId,
        businessID,
        dimensionId,
        tokenAmount,
        timestamp,
        metadata,
        measurement,
    }: {
        customerId: string;
        businessID: string;
        dimensionId: string;
        tokenAmount: string | number;
        timestamp: string;
        metadata?: Record<string, string>;
        measurement: string;
    }): MeasurementFormat {
        return {
            customerId,
            businessID,
            dimensionId,
            recordValue: typeof tokenAmount === 'number' ? tokenAmount : parseFloat(tokenAmount),
            timestamp,
            metadata,
            _measurement: measurement,
        };
    }

    static transformer(
        {
            customerId,
            businessID,
            dimensionId,
            tokenAmount,
            timestamp,
            metadata,
            measurement,
        }: {
            customerId: string;
            businessID: string;
            dimensionId: string;
            tokenAmount: string | number;
            timestamp: string;
            metadata?: Record<string, string>;
            measurement: string;
        },
        influxService: InfluxService,
    ): Point {
        return MeasurementFormat.getPointForm(
            TokenConsumer.toMeasurementFormat({
                customerId,
                businessID,
                dimensionId,
                tokenAmount,
                timestamp,
                metadata,
                measurement,
            }),
            influxService,
        );
    }
}
