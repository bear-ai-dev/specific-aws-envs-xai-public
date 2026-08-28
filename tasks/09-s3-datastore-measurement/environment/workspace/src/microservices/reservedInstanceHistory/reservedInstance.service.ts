import { InternalServerErrorException, Logger } from '@nestjs/common';
import { InfluxService } from '../../influx/influx.service';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getReservedInstanceCount } from '../../utils/aws/awsEc2';
import { ReservedInstanceEntity } from './entities/reservedInstances.entity';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto';
import { SchedulerEntity } from '../../scheduler/entities/scheduler.entity';
import { Job } from 'bull';
import { Point } from '@influxdata/influxdb-client';
import { AuditScope } from '../../audit/entities/audit.interface';
import { AuditService } from '../../audit/audit.service';

@Processor('scheduler_queue')
export class ReservedInstanceService {
    private static readonly logger = new Logger(ReservedInstanceService.name);
    constructor(readonly InfluxService: InfluxService) {}
    @Process('reservedInstanceHours')
    async getInstanceUptime({ data: { scheduleParameters, businessID, subject, rate } }: Job<SchedulerEntity>) {
        if ('iamRoleArn' in scheduleParameters) {
            const { iamRoleArn, externalId } = scheduleParameters;
            ReservedInstanceService.logger.log(
                'Processing Automated Reserved Instances gathering event, logging inputs',
                {
                    rate,
                    businessID,
                    externalId,
                    subject,
                }
            );
            const creds = fromTemporaryCredentials({
                params: { RoleArn: iamRoleArn, ExternalId: externalId },
                clientConfig: { region: 'us-east-1' },
            });

            const reservedInstances = await getReservedInstanceCount(creds, 'us-east-1', []);
            const points = reservedInstances.map(
                ({
                    InstanceType,
                    InstanceCount,
                    InstanceTenancy,
                    FixedPrice,
                    End,
                    AvailabilityZone,
                    RecurringCharges,
                    ReservedInstancesId,
                    OfferingType,
                    Start,
                }): Point => {
                    const rie = new ReservedInstanceEntity({
                        instanceCount: InstanceCount.toString(),
                        instanceType: InstanceType,
                        instanceTenancy: InstanceTenancy,
                        fixedPrice: FixedPrice.toString(),
                        endDate: End.toISOString(),
                        availabilityZone: AvailabilityZone,
                        recurringCharges: JSON.stringify(RecurringCharges),
                        reservedInstancesId: ReservedInstancesId,
                        businessID: businessID,
                        OfferingType: OfferingType,
                        startDate: Start.toISOString(),
                    });
                    return ReservedInstanceEntity.transformer(rie, this.InfluxService);
                }
            );
            const { loadPoints } = this.InfluxService;
            ReservedInstanceService.logger.log('Loading Reserved Instance Entity Points into Influx', points.length);
            const results = await loadPoints(`${process.env.STAGE}-usage-data`, 'meteringco', points);
            return results;
        } else {
            throw new InternalServerErrorException('iamRoleArn not found in scheduleParameters');
        }
    }
    @OnQueueFailed({ name: infrastructureType.podCPUHours })
    jobFailure(job: Job) {
        AuditService.publishEvent({
            message: 'Failed to get Reserved Instances',
            data: job.data,
            topic: AuditScope.ERROR,
        });
    }
}
