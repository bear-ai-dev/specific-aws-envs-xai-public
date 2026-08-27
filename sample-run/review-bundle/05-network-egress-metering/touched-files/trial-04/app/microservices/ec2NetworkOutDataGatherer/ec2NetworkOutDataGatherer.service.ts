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
            clientConfig: { region: 'us-east-1' },
        });
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
            return (
                meteringcoDimensionIds.includes(dimensionId) && !!tags.find((tag) => tag.Key === 'meteringcoCustomerId')
            );
        });

        const usageByCustomer: Record<string, { customerId: string; bytes: number; metadata: Record<string, string> }> =
            {};
        const instanceIds = taggedInstance.map((instance) => instance.InstanceId).filter(Boolean);
        const networkOutByInstance = await getInstanceNetworkOutBytes({
            region,
            credentials: creds,
            instanceIds,
        });

        taggedInstance.forEach((instance) => {
            const tags = instance.Tags || [];
            const customerTag = tags.find((tag) => tag.Key === 'meteringcoCustomerId');
            const customerId = customerTag?.Value;
            if (!customerId) {
                return;
            }
            const bytes = networkOutByInstance[instance.InstanceId];
            if (bytes === undefined) {
                return;
            }
            if (!usageByCustomer[customerId]) {
                const metadata = tags.reduce(
                    (acc, tag) => {
                        acc[tag.Key] = tag.Value;
                        return acc;
                    },
                    {} as Record<string, string>,
                );
                metadata.InstanceId = instance.InstanceId;
                usageByCustomer[customerId] = { customerId, bytes: 0, metadata };
            }
            usageByCustomer[customerId].bytes += bytes;
        });

        Object.values(usageByCustomer).forEach(({ customerId, bytes, metadata }) => {
            const entity = new StandardMeasurementEntity({
                businessID,
                dimensionId,
                metadata,
                recordValue: bytes,
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
