import { BadRequestException, Logger } from '@nestjs/common';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getInstanceWithFilters } from '../../utils/aws/awsEc2.js';
import { getNetworkOutBytesByInstance } from '../../utils/aws/awsCloudWatch.js';
import { getAwsClientConfig } from '../../utils/aws/awsClient.js';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity.js';
import { UsageEntity } from '../../usage/entities/usage.entity.js';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto.js';
import { Job } from 'bull';
import { SchedulerEntity } from '../../scheduler/entities/scheduler.entity.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuditScope } from '../../audit/entities/audit.interface.js';

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
            }),
        );
        const creds = fromTemporaryCredentials({
            params: { RoleArn: iamRoleArn, ExternalId: externalId ? externalId : undefined },
            clientConfig: getAwsClientConfig('us-east-1'),
        });
        // Power state is irrelevant: stopped or recently torn-down machines still owe for bytes they sent.
        const instanceList = (await getInstanceWithFilters(region, creds, [])) || [];
        const taggedInstance = instanceList.filter((instance) => {
            const tags = instance.Tags || [];
            const taggedDimensionIdVal = tags.find((tag) => tag.Key === 'meteringcoDimensionId');
            if (!taggedDimensionIdVal || !taggedDimensionIdVal.Value) {
                return false;
            }
            const meteringcoDimensionIds = taggedDimensionIdVal.Value.split(',').map((value) => value.trim());
            const customerTag = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
            return meteringcoDimensionIds.includes(dimensionId) && !!customerTag?.Value;
        });

        const instanceIds = taggedInstance.map((instance) => instance.InstanceId).filter(Boolean);
        const networkOutByInstance = await getNetworkOutBytesByInstance(region, creds, instanceIds);

        const customerTotals: Record<string, number> = {};
        taggedInstance.forEach((instance) => {
            const tags = instance.Tags || [];
            const customerTag = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
            const customerId = customerTag?.Value;
            if (!customerId) {
                return;
            }
            const sentBytes = networkOutByInstance[instance.InstanceId] || 0;
            customerTotals[customerId] = (customerTotals[customerId] || 0) + sentBytes;
        });

        Object.keys(customerTotals).forEach((customerId) => {
            const entity = new StandardMeasurementEntity({
                businessID,
                dimensionId,
                metadata: {},
                recordValue: customerTotals[customerId],
                customerId,
                _measurement: UsageEntity._measurement,
            });
            StandardMeasurementEntity.publish(entity);
        });
        Ec2NetworkOutDataGathererService.logger.log('Finished collecting EC2 instance network out data');
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
