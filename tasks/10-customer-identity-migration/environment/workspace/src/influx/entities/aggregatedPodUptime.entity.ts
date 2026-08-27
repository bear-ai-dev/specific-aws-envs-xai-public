import { timeBasedUnits } from '../../dimensions/dto/create-dimension.dto';

import { upTimeAggregationEntity } from '../../dimensions/entities/uptimeAggregationEntity';
import { BaseInfluxTable } from './baseInfluxTable.entity';

export class uptimeAggregationInfluxRow extends BaseInfluxTable {
    public _measurement = upTimeAggregationEntity._measurement;
    public _value: number;
    public _field: string;
    public startTime: string;
    public endTime: string;
    public units: timeBasedUnits;
    public dimensionId: string;
    public serviceId: string;
    public businessID: string;
    public applicationId: string;
}
