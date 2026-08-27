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
        // Do not filter on power state: stopped or torn-down machines still owe for bytes they sent.
        const instanceList = await getInstanceWithFilters(region, creds, [
            { Name: 'tag-key', Values: ['meteringcoDimensionId'] },
        ]);
        const taggedInstance = instanceList.filter((instance) => {
            const tags = instance.Tags || [];
            const taggedDimensionIdVal = tags.find((tag) => tag.Key === 'meteringcoDimensionId');
            if (!taggedDimensionIdVal) {
                return false;
            }
            const meteringcoDimensionIds = taggedDimensionIdVal.Value.split(',');
            const hasCustomer = !!tags.find((tag) => tag.Key === 'meteringcoCustomerId');
            return meteringcoDimensionIds.includes(dimensionId) && hasCustomer;
        });

        const endTime = new Date();
        const customerTotals: Record<string, { total: number; metadata: Record<string, string> }> = {};

        await Promise.all(
            taggedInstance.map(async (instance) => {
                const tags = instance.Tags || [];
                const customerTag = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
                const customerId = customerTag?.Value;
                if (!customerId) {
                    return;
                }
                const bytesOut = await getInstanceNetworkOutBytes(
                    region,
                    creds,
                    instance.InstanceId,
                    endTime,
                    FIVE_MINUTES_IN_MS,
                );
                if (!customerTotals[customerId]) {
                    const metadata = tags.reduce(
                        (acc, tag) => {
                            acc[tag.Key] = tag.Value;
                            return acc;
                        },
                        {} as Record<string, string>,
                    );
                    metadata.InstanceId = instance.InstanceId;
                    customerTotals[customerId] = { total: 0, metadata };
                }
                customerTotals[customerId].total += bytesOut;
            }),
        );

        Object.keys(customerTotals).forEach((customerId) => {
            const { total, metadata } = customerTotals[customerId];
            const entity = new StandardMeasurementEntity({
                businessID,
                dimensionId,
                metadata,
                recordValue: total,
                customerId,
                _measurement: UsageEntity._measurement,
            });
            StandardMeasurementEntity.publish(entity);
        });
        Ec2NetworkOutDataGathererService.logger.log('Finished collecting EC2 instance NetworkOut data');
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
