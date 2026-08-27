import { BaseInfluxTable } from './baseInfluxTable.entity';

export class MonthlyCostInfluxRow extends BaseInfluxTable {
    public _value: number;
    public _time: string;
}
