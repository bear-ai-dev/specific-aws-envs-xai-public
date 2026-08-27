import { BadRequestException, Logger } from '@nestjs/common';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { getInstanceWithFilters } from '../../utils/aws/awsEc2.js';
import { getInstancesNetworkOutBytes } from '../../utils/aws/awsCloudWatch.js';
import { StandardMeasurementEntity } from '../../measurement-config/entities/standardMeasurement.entity.js';
import { UsageEntity } from '../../usage/entities/usage.entity.js';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { infrastructureType } from '../../dimensions/dto/create-dimension.dto.js';
import { Job } from 'bull';
import { SchedulerEntity } from '../../scheduler/entities/scheduler.entity.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuditScope } from '../../audit/entities/audit.interface.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

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
            clientConfig: {
                region: 'us-east-1',
                ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
            },
            masterCredentials: process.env.AWS_ACCESS_KEY_ID
                ? {
                      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                  }
                : undefined,
        });
        // Do not filter by power state: stopped or terminated machines still sent traffic while they were up.
        // Filter tags in-process so emulator DescribeInstances filters cannot drop billable machines.
        const instanceList = await getInstanceWithFilters(region, creds, []);
        const taggedInstance = instanceList.filter((instance) => {
            const tags = instance.Tags || [];
            const taggedDimensionIdVal = tags.find((tag) => tag.Key === 'meteringcoDimensionId');
            const taggedCustomerIdVal = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
            if (!taggedDimensionIdVal || !taggedCustomerIdVal) {
                return false;
            }
            if (!taggedCustomerIdVal.Value || taggedCustomerIdVal.Value.trim() === '') {
                return false;
            }
            const meteringcoDimensionIds = taggedDimensionIdVal.Value.split(',').map((id) => id.trim());
            return meteringcoDimensionIds.includes(dimensionId);
        });

        const customerTotals: Record<string, number> = {};
        const customerMetadata: Record<string, Record<string, string>> = {};
        if (taggedInstance.length) {
            const instanceIds = taggedInstance.map((instance) => instance.InstanceId).filter(Boolean);
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - FIVE_MINUTES_MS);
            const networkOutByInstance = await getInstancesNetworkOutBytes(
                region,
                creds,
                instanceIds,
                startTime,
                endTime,
            );
            taggedInstance.forEach((instance) => {
                const tags = instance.Tags || [];
                const customerTag = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
                const customerId = customerTag?.Value;
                if (!customerId) {
                    return;
                }
                const bytes = networkOutByInstance[instance.InstanceId] || 0;
                customerTotals[customerId] = (customerTotals[customerId] || 0) + bytes;
                if (!customerMetadata[customerId]) {
                    customerMetadata[customerId] = {
                        region,
                        InstanceId: instance.InstanceId,
                    };
                }
            });
        }

        Object.keys(customerTotals).forEach((customerId) => {
            const entity = new StandardMeasurementEntity({
                businessID,
                dimensionId,
                metadata: customerMetadata[customerId],
                recordValue: customerTotals[customerId],
                customerId,
                _measurement: UsageEntity._measurement,
            });
            StandardMeasurementEntity.publish(entity);
        });
        Ec2NetworkOutDataGathererService.logger.log('Finished collecting EC2 instance network out data', {
            customerCount: Object.keys(customerTotals).length,
            instanceCount: taggedInstance.length,
        });
    }

    @OnQueueFailed({ name: infrastructureType.instanceNetworkOut })
    jobFailure(job: Job) {
        AuditService.publishEvent({
            message: 'Failed to measure EC2 instance outbound network traffic',
            data: [job],
            topic: AuditScope.ERROR,
        });
    }
}
