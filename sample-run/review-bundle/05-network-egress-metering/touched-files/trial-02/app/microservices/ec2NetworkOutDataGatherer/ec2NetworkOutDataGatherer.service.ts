import { BadRequestException, Logger } from '@nestjs/common';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getInstanceWithFilters } from '../../utils/aws/awsEc2.js';
import { getInstanceNetworkOutBytes } from '../../utils/aws/awsCloudWatch.js';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity.js';
import { UsageEntity } from '../../usage/entities/usage.entity.js';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto.js';
import { Job } from 'bull';
import { SchedulerEntity } from '../../scheduler/entities/scheduler.entity.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuditScope } from '../../audit/entities/audit.interface.js';

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

@Processor('scheduler_queue')
export class Ec2NetworkOutDataGathererService {
    private static readonly logger = new Logger(Ec2NetworkOutDataGathererService.name);
    constructor() {}

    @Process(infrastructureType.instanceNetworkOut)
    async readOperationJob({ data: { scheduleParameters, businessID, subject, rate } }: Job<SchedulerEntity>) {
        if (!('iamRoleArn' in scheduleParameters)) {
            throw new BadRequestException('Iam role arn not found');
        }
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { iamRoleArn, externalId, dimensionId, region } = scheduleParameters;
        Ec2NetworkOutDataGathererService.logger.log(
            'Processing Automated Instance Network Out gathering event, logging inputs',
            JSON.stringify({
                rate,
                businessID,
                externalId,
                subject,
                dimensionId,
                region,
            }),
        );
        const creds = fromTemporaryCredentials({
            params: { RoleArn: iamRoleArn, ExternalId: externalId ? externalId : undefined },
            clientConfig: { region: 'us-east-1' },
        });
        // Do not filter on power state: a stopped or torn-down machine still sent whatever it sent while up.
        const instanceList = await getInstanceWithFilters(region, creds, [
            { Name: 'tag-key', Values: ['meteringcoDimensionId'] },
        ]);
        const taggedInstances = (instanceList || []).filter((instance) => {
            const tags = instance.Tags || [];
            const taggedDimensionIdVal = tags.find((tag) => tag.Key === 'meteringcoDimensionId');
            const taggedCustomerIdVal = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
            if (!taggedDimensionIdVal || !taggedCustomerIdVal || !taggedCustomerIdVal.Value) {
                return false;
            }
            const meteringcoDimensionIds = taggedDimensionIdVal.Value.split(',').map((value) => value.trim());
            return meteringcoDimensionIds.includes(dimensionId);
        });

        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - FIVE_MINUTES_IN_MS);
        const bytesByCustomer: Record<string, number> = {};

        await Promise.all(
            taggedInstances.map(async (instance) => {
                const customerId = instance.Tags.find((tag) => tag.Key === 'meteringcoCustomerId').Value;
                const outboundBytes = await getInstanceNetworkOutBytes(
                    region,
                    creds,
                    instance.InstanceId,
                    startTime,
                    endTime,
                );
                bytesByCustomer[customerId] = (bytesByCustomer[customerId] || 0) + outboundBytes;
            }),
        );

        Object.keys(bytesByCustomer).forEach((customerId) => {
            const entity = new StandardMeasurementEntity({
                businessID,
                dimensionId,
                metadata: {
                    region,
                },
                recordValue: bytesByCustomer[customerId],
                customerId,
                _measurement: UsageEntity._measurement,
            });
            StandardMeasurementEntity.publish(entity);
        });
        Ec2NetworkOutDataGathererService.logger.log('Finished collecting EC2 instance network out data', {
            customerCount: Object.keys(bytesByCustomer).length,
        });
    }

    @OnQueueFailed({ name: infrastructureType.instanceNetworkOut })
    jobFailure(job: Job) {
        AuditService.publishEvent({
            message: 'Failed to measure EC2 instance network out',
            data: [job],
            topic: AuditScope.ERROR,
        });
    }
}
