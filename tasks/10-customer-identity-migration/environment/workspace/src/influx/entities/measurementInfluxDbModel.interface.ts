import { ValidMeasurementTypes } from '../../measurement-config/entities/measurement.interface';
import { BaseInfluxTable } from './baseInfluxTable.entity';

export interface MeasurementInfluxDbModel extends BaseInfluxTable {
    measurementId?: string;
    applicationId?: string;
    serviceId?: string;
    dimensionId?: string;
    recordValue: number;
    uniqueInfrastructureId?: string;
    businessID: string;
    _field: string;
    _value: number;
    [metadata: string]: string | number;
}
