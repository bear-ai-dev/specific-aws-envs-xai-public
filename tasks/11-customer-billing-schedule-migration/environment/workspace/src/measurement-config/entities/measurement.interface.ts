import { Point } from '@influxdata/influxdb-client';
import { MeasurementInfluxDbModel } from '../../influx/entities/measurementInfluxDbModel.interface';
import { InfluxService } from '../../influx/influx.service';
export enum ValidMeasurementTypes {
    int = 'int',
    float = 'float',
}

export abstract class MeasurementFormat {
    dimensionId?: string;
    customerId: string;
    timeStamp?: string;
    recordValue: number;
    businessID: string;
    metadata: Record<string, string>;
    _measurement: string;
    static getPointForm(measurement: MeasurementFormat, influxService: InfluxService): Point {
        const point = influxService.getPoint(measurement._measurement);
        point.timestamp(new Date(measurement.timeStamp));
        point.tag('customerId', measurement.customerId);
        point.tag('dimensionId', measurement.dimensionId);
        point.tag('businessID', measurement.businessID);
        point.floatField('recordValue', measurement.recordValue);
        if (measurement?.metadata) {
            Object.keys(measurement.metadata).forEach((key) => {
                point.tag(`metadata_${key}`, measurement.metadata[key]);
            });
        }
        return point;
    }
    static toEntity(dbModel: MeasurementInfluxDbModel): MeasurementFormat {
        const measurementInput: MeasurementFormat = {
            timeStamp: dbModel._time,
            dimensionId: dbModel.dimensionId,
            recordValue: dbModel._value,
            metadata: {},
            _measurement: dbModel._measurement,
            businessID: dbModel.businessID,
            customerId: dbModel.customerId,
        };
        Object.keys(dbModel).forEach((key) => {
            if (key.startsWith('metadata_') && dbModel[key]) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                measurementInput.metadata[key.replace('metadata_', '')] = dbModel[key];
            }
        });
        return measurementInput;
    }
}
