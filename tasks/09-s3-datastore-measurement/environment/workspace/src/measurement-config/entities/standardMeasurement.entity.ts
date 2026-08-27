import { Tag } from '@aws-sdk/client-ec2';
import { randomUUID } from 'crypto';
import EventEmitter from 'events';
import { AuditService } from '../../audit/audit.service';
import { AuditScope } from '../../audit/entities/audit.interface';
import { InfluxService } from '../../influx/influx.service';
import { MeasurementFormat } from './measurement.interface';

const eventEmitter = new EventEmitter();
export class StandardMeasurementEntity implements MeasurementFormat {
    public timeStamp?: string;
    public dimensionId?: string;
    public businessID: string;
    public applicationId?: string;
    public serviceId?: string;
    public recordValue: number;
    public metadata: Record<string, string>;
    public _measurement: string;
    public static allowedTags = ['meteringcoApplicationId', 'meteringcoServiceId', 'meteringcoDimensionId'];

    constructor(measurement: MeasurementFormat) {
        if (measurement.timeStamp) {
            this.timeStamp = measurement.timeStamp;
        } else {
            this.timeStamp = new Date().toISOString();
        }
        this.dimensionId = measurement.dimensionId;
        this.applicationId = measurement.applicationId;
        this.serviceId = measurement.serviceId;
        this.recordValue = measurement.recordValue;
        this.metadata = measurement.metadata;
        this.businessID = measurement.businessID;
        this._measurement = measurement._measurement;
    }
    static publish(publishRequest: MeasurementFormat) {
        eventEmitter.emit('standardMeasurements', publishRequest);
        return {
            message: 'published',
            id: randomUUID(),
            data: [publishRequest],
        };
    }
    static subscribe(influxService: InfluxService) {
        eventEmitter.on('standardMeasurements', async (measurementFormat: MeasurementFormat) => {
            const point = MeasurementFormat.getPointForm(measurementFormat, influxService);
            try {
                await influxService.loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, [point]);
            } catch (err) {
                AuditService.publishEvent({
                    data: [{ err }],
                    message: 'Failed to index Measurement',
                    topic: AuditScope.ERROR,
                });
            }
        });
    }
    static awsTagKeyReducer(Tags: Tag[]) {
        if (Tags) {
            return Tags.reduce((acc, { Key, Value }): any => {
                if (StandardMeasurementEntity.allowedTags.includes(Key)) {
                    acc[Key] = Value;
                }
                return acc;
            }, {});
        } else {
            return {};
        }
    }
}
