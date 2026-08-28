import { dataBasedUnits } from '../../dimensions/dto/create-dimension.dto';
import { BaseInfluxTable } from './baseInfluxTable.entity';

export class ebsVolumeAggregationEntityRow extends BaseInfluxTable {
    public static _measurement = ebsVolumeAggregationEntityRow._measurement;
    public startTime: string;
    public endTime: string;
    public _value: number;
    public _field: string;
    public units: dataBasedUnits;
    public dimensionId: string;
    public serviceId: string;
    public businessID: string;
    public applicationId: string;
    public volumeID: string;
}
