import { EbsVolumeDataGathererEntity } from '../../microservices/ebsVolumeDataGatherer/entities/ebsVolumeDataGatherer.entity';
import { BaseInfluxTable } from './baseInfluxTable.entity';

export class EBSStorageCostEntity extends BaseInfluxTable {
    public volumeID: EbsVolumeDataGathererEntity['volumeID'];
    public storageSize: EbsVolumeDataGathererEntity['size'];
    public iops: EbsVolumeDataGathererEntity['iops'];
    public volumeType: EbsVolumeDataGathererEntity['volumeType'];
    public throughput: EbsVolumeDataGathererEntity['throughput'];
    public businessID: EbsVolumeDataGathererEntity['businessID'];

    public _value: number;
}
