import { EbsVolumeDataGathererEntity } from '../../microservices/ebsVolumeDataGatherer/entities/ebsVolumeDataGatherer.entity';
import { EbsSnapshotDataGathererEntity } from '../../microservices/ebsSnapshotDataGatherer/entities/ebsSnapshotDataGatherer.entity';
import { BaseInfluxTable } from './baseInfluxTable.entity';

export class EBSVolumeProvisionedCapacity extends BaseInfluxTable {
    public volumeID: EbsVolumeDataGathererEntity['volumeID'];
    public size: EbsVolumeDataGathererEntity['size'];
    public iops: EbsVolumeDataGathererEntity['iops'];
    public volumeType: EbsVolumeDataGathererEntity['volumeType'];
    public tags: EbsVolumeDataGathererEntity['tags'];
    public state: EbsVolumeDataGathererEntity['state'];
    public throughput: EbsVolumeDataGathererEntity['throughput'];
    public availabilityZone: EbsVolumeDataGathererEntity['availabilityZone'];
    public businessID: EbsVolumeDataGathererEntity['businessID'];
    public region: EbsVolumeDataGathererEntity['region'];

    public _value: number;
}

export class EBSSnapshot extends BaseInfluxTable {
    public volumeID: EbsSnapshotDataGathererEntity['volumeID'];
    public businessID: EbsSnapshotDataGathererEntity['businessID'];
    public _field: EbsSnapshotDataGathererEntity['size'];
    public snapshotOwnerID: EbsSnapshotDataGathererEntity['snapshotOwnerID'];
    public snapshotStartTime: EbsSnapshotDataGathererEntity['snapshotStartTime'];
    public storageTier: EbsSnapshotDataGathererEntity['storageTier'];
    public snapshotId: EbsSnapshotDataGathererEntity['snapshotId'];

    public _value: number;
}
