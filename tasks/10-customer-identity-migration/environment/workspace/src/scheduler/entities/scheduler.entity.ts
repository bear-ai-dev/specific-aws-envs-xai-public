import { ApiHideProperty } from '@nestjs/swagger';
import { EbsSnapshotDto } from '../../microservices/ebsSnapshotDataGatherer/dto/ebsSnapshot.dto';
import { EbsVolumeDataGathererDto } from '../../microservices/ebsVolumeDataGatherer/dto/ebsVolumeDataGatherer.dto';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { SupportedMeasurementFrequencies, SchedulerStatus, schedulerType } from '../dto/scheduler.dto';
import { AggregationDto } from '../../dimensions/dto/aggregation.dto';
import { CreateBillingReportDto } from '../../billing/dto/createBillingReport.dto';
import { Ec2InstanceDataGathererDto } from '../../microservices/ec2InstanceDataGatherer/Dto/ec2InstanceDataGatherer.dto';
import { Ec2EgressDataGathererDto } from '../../microservices/ec2EgressDataGatherer/Dto/ec2EgressDataGatherer.dto';

export class SchedulerEntity {
    @ApiHideProperty()
    public static _measurement = 'SchedulerConfig';

    /**
     *  Represents the unqiue value of the scheduler
     * @example e345f409-daca-4144-91d2-0a0f87c96581
     */
    public schedulerID?: string;

    /**
     * Determines if the scheduler is live or inactive
     * @example 'live'
     * @example 'inactive'
     */
    public schedulerStatus: SchedulerStatus;

    @ApiHideProperty()
    public businessID?: string;

    /**
     * Controls the service called by the scheduler
     * @example "billing"
     */
    public schedulerType: schedulerType;

    /**
     * The parameters to be passed to the scheduler service function
     * Cannot contain the substring "schedulerParam_" (without the quotes). This is due to how we internally model these keys
     * @example {"myCoolKey": "SomeReally1337Value"}
     * @example {"serviceId": "1234abc"}
     * @example {"iamRole": "myCoolIAMRole::", "ExternalID": "foobar"}
     */
    public scheduleParameters:
        | Ec2InstanceDataGathererDto
        | EbsSnapshotDto
        | EbsVolumeDataGathererDto
        | AggregationDto
        | CreateBillingReportDto
        | Ec2EgressDataGathererDto;

    /**
     *  The rate for the scheduler to use
     * @example perMinute
     */
    public rate: SupportedMeasurementFrequencies;

    /**
     * The subject associated with the user
     */
    public subject: CreateUserDto['subject'];

    constructor({
        schedulerStatus = SchedulerStatus.live,
        schedulerType,
        businessID,
        scheduleParameters,
        rate,
        schedulerID,
        subject,
    }) {
        this.schedulerStatus = schedulerStatus;
        this.schedulerType = schedulerType;
        this.businessID = businessID;
        this.scheduleParameters = scheduleParameters;
        this.rate = rate;
        this.schedulerID = schedulerID;
        this.subject = subject;
    }
}
