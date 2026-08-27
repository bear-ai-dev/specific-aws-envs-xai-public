import { EbsVolumeDataGathererEntity } from '../../microservices/ebsVolumeDataGatherer/entities/ebsVolumeDataGatherer.entity';
import { BaseInfluxTable } from './baseInfluxTable.entity';

export class EC2CostInfluxRow extends BaseInfluxTable {
    public _value: number;
    public unitCost: number;
    public cpu: number;
    public ram: number;
    public podId: string;
    public meteringcoId: string;
    public businessID: string;
    public timeDelta: number;
}
