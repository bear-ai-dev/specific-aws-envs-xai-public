import { dataBasedUnits } from '../../dimensions/dto/create-dimension.dto';
import { ebsSnapshotAggregationEntity } from '../../dimensions/entities/ebsSnapshotAggregationEntity';
import { BaseInfluxTable } from './baseInfluxTable.entity';

export class ebsSnapshotAggregationEntityRow extends BaseInfluxTable {
    public _measurement = ebsSnapshotAggregationEntity._measurement;
    public startTime: string;
    public endTime: string;
    public _value: number;
    public _field: string;
    public units: dataBasedUnits;
    public dimensionId: string;
    public serviceId: string;
    public businessID: string;
    public applicationId: string;
    public snapshotId: string;
}
