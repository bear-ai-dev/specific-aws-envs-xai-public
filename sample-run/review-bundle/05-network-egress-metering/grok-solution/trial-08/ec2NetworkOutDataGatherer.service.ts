import { BadRequestException, Logger } from '@nestjs/common';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getInstanceWithFilters } from '../../utils/aws/awsEc2.js';
import { getNetworkOutBytesByInstance } from '../../utils/aws/awsCloudWatch.js';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity.js';
import { UsageEntity } from '../../usage/entities/usage.entity.js';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto.js';
import { Job } from 'bull';
import { SchedulerEntity } from '../../scheduler/entities/scheduler.entity.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuditScope } from '../../audit/entities/audit.interface.js';

// CloudWatch EC2 basic monitoring publishes a few minutes late. Fifteen
// minutes covers the five-minute interval that just finished even when
// this job runs at the end of the current period.
const COLLECTION_LOOKBACK_MS = 15 * 60 * 1000;
const FIVE_MINUTES_SECONDS = 300;

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
            'Processing Automated Instance NetworkOut gathering event, logging inputs',
            JSON.stringify({
                rate,
                businessID,
                externalId,
                subject,
            }),
        );
        const creds = fromTemporaryCredentials({
            params: { RoleArn: iamRoleArn, ExternalId: externalId ? externalId : undefined },
            clientConfig: { region: 'us-east-1' },
        });
        // Include every power state: a machine that has since been stopped or
        // torn down still sent whatever it sent while it was up.
        const instanceList = await getInstanceWithFilters(region, creds, [
            { Name: 'tag-key', Values: ['meteringcoDimensionId'] },
        ]);
        const taggedInstance = instanceList.filter((instance) => {
            const tags = instance.Tags || [];
            const taggedDimensionIdVal = tags.find((tag) => tag.Key === 'meteringcoDimensionId');
            if (!taggedDimensionIdVal) {
                return false;
            }
            const meteringcoDimensionIds = taggedDimensionIdVal.Value.split(',').map((value) => value.trim());
            const customerTag = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
            return meteringcoDimensionIds.includes(dimensionId) && !!customerTag?.Value;
        });

        const instanceIds = taggedInstance.map((instance) => instance.InstanceId).filter(Boolean);
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - COLLECTION_LOOKBACK_MS);
        const bytesByInstance = await getNetworkOutBytesByInstance(
            region,
            creds,
            instanceIds,
            startTime,
            endTime,
            FIVE_MINUTES_SECONDS,
        );

        const totalsByCustomer = new Map<string, number>();
        taggedInstance.forEach((instance) => {
            const tags = instance.Tags || [];
            const customerId = tags.find((tag) => tag.Key === 'meteringcoCustomerId')?.Value;
            if (!customerId) {
                return;
            }
            const bytes = bytesByInstance.get(instance.InstanceId);
            // A machine with no observations in the interval contributed nothing
            // and does not create a billable row on its own.
            if (bytes === undefined) {
                return;
            }
            totalsByCustomer.set(customerId, (totalsByCustomer.get(customerId) || 0) + bytes);
        });

        totalsByCustomer.forEach((recordValue, customerId) => {
            const entity = new StandardMeasurementEntity({
                businessID,
                dimensionId,
                customerId,
                recordValue,
                _measurement: UsageEntity._measurement,
            });
            StandardMeasurementEntity.publish(entity);
        });
        Ec2NetworkOutDataGathererService.logger.log('Finished collecting EC2 instance NetworkOut data', {
            customerCount: totalsByCustomer.size,
            instanceCount: taggedInstance.length,
        });
    }

    @OnQueueFailed({ name: infrastructureType.instanceNetworkOut })
    jobFailure(job: Job) {
        AuditService.publishEvent({
            message: 'Failed to measure EC2 instance NetworkOut',
            data: [job],
            topic: AuditScope.ERROR,
        });
    }
}
