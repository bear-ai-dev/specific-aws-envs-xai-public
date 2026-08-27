import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    NotImplementedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';

import {
    SchedulerDeletionResponse,
    SchedulerDto,
    SchedulerReadResponseDTO,
    schedulerType,
    SupportedMeasurementFrequencies as rateEnum,
} from './dto/scheduler.dto';
import { v4 } from 'uuid';
import { SchedulerEntity } from './entities/scheduler.entity';
import { BasicResponseDTO } from '../basicResponseDTO';

import { Queue } from 'bull';
import { infrastructureType } from '../dimensions/dto/create-dimension.dto';
import { aggregationType } from '../dimensions/entities/dimensions.entity';
import { billingScheduleConsumers } from '../billing/entities/billing.entity';
import flattenDeep from 'lodash.flattendeep';

@Injectable()
export class SchedulerService {
    private static readonly logger = new Logger(SchedulerService.name);

    constructor(
        @InjectQueue('scheduler_queue') private queue: Queue,
        @InjectQueue('scheduler_billing_queue') private billingQueue: Queue
    ) {}

    async create({ schedulerID = v4(), ...rest }: SchedulerDto): Promise<SchedulerReadResponseDTO> {
        SchedulerService.logger.log('Logging scheduler input', { schedulerID, ...rest });

        // turn DTO into entity
        const schedulerEntity = new SchedulerEntity({ schedulerID, ...rest });

        const response = await this.pushRepeatJobToQueue(schedulerEntity);
        SchedulerService.logger.log('Successfully committed to queue', { ...response });
        return { message: 'Cron expression added', data: [{ id: schedulerID }] };
    }

    async findAll({ businessID }: { businessID: string }): Promise<SchedulerReadResponseDTO> {
        SchedulerService.logger.log(`Finding scheduled tasks for ${businessID}`);

        const allJobData = await this.queue.getRepeatableJobs();
        const filteredData = allJobData.reduce((acc, { id, cron, key }) => {
            const [firstElement] = id.split('#');
            if (firstElement === `${businessID}`) {
                acc.push({ id, cron, key });
            }
            return acc;
        }, []);

        SchedulerService.logger.debug(JSON.stringify(filteredData));
        if (filteredData.length > 0) {
            return {
                data: filteredData,
                message: 'Found Schedules',
            };
        } else {
            throw new NotFoundException('No Schedules found');
        }
    }

    async findOne({ businessID, schedulerID }: { businessID: string; schedulerID: string }) {
        SchedulerService.logger.log(`Finding schedulerID: ${schedulerID} for ${businessID}`);
        const allJobData = flattenDeep(
            await Promise.all([this.queue.getRepeatableJobs(), this.billingQueue.getRepeatableJobs()])
        );

        const filteredData = allJobData.reduce((acc, { id, cron, key }) => {
            const [jobBusinessID, jobSchedulerID, ...rest] = id.split('#');
            if (`${businessID}#${schedulerID}` === `${jobBusinessID}#${jobSchedulerID}`) {
                acc.push({ id, cron, key });
            }

            if (rest) {
                SchedulerService.logger.warn(`Unknown partition on key for schedule: ${rest}`);
            }
            return acc;
        }, []);
        // Lookup queue job information
        // build configuration out of it
        SchedulerService.logger.debug(JSON.stringify(filteredData));
        if (filteredData.length > 0) {
            return {
                data: [filteredData[0]],
                message: 'Found Schedule',
            };
        } else {
            throw new NotFoundException(`Schedule with ID: ${schedulerID} not found`);
        }
    }

    async remove({
        businessID,
        schedulerID,
        isBillingQueue,
    }: {
        businessID: string;
        schedulerID: string;
        isBillingQueue?: boolean;
    }): Promise<SchedulerDeletionResponse> {
        const errors = [];
        SchedulerService.logger.log(`Attempting to delete schedulerID: ${schedulerID} for ${businessID}`);
        const response = await this.findOne({ businessID, schedulerID });
        if (response.data.length === 0) {
            throw new NotFoundException(`Schedule with ID: ${schedulerID} not found`);
        } else {
            try {
                if (isBillingQueue) {
                    this.billingQueue.removeRepeatableByKey(response.data[0].key);
                } else {
                    this.queue.removeRepeatableByKey(response.data[0].key);
                }
            } catch (error) {
                SchedulerService.logger.error(
                    'Error occurred while trying to delete scheduled task in queue',
                    error?.stack,
                    error
                );
                errors.push(error);
            }
        }
        if (errors.length) {
            throw new InternalServerErrorException(errors, 'Error while deleting job');
        } else {
            return { message: 'Deleted Schedule', data: [{ id: schedulerID }] };
        }
    }

    private async pushRepeatJobToQueue(schedulerEntity: SchedulerEntity): Promise<BasicResponseDTO> {
        const {
            schedulerType: passedInScheduleType,
            scheduleParameters,
            rate,
            businessID,
            schedulerID,
        } = schedulerEntity;
        // Based on the type, get the correct function
        if (passedInScheduleType === schedulerType.billing) {
            SchedulerService.logger.log('Schedule Type matches billing');
            await this.billingQueue.add(
                billingScheduleConsumers.billingReport,
                { ...schedulerEntity },
                {
                    repeat: { cron: rate.toString() },
                    jobId: `${businessID}#${schedulerID}`,
                }
            );
            return { message: 'Committed Billing Job' };
        } else if (passedInScheduleType === schedulerType.dimensionDataGathering) {
            SchedulerService.logger.log('Schedule Type matches dimensionDataGathering');
            if ('dimensionType' in scheduleParameters) {
                const { dimensionType } = scheduleParameters;
                const response = await this.queue.add(
                    dimensionType,
                    { ...schedulerEntity },
                    {
                        repeat: { cron: rate.toString() },
                        jobId: `${businessID}#${schedulerID}`,
                    }
                );
                SchedulerService.logger.log('Response from Queue Commit', JSON.stringify(response, null, 2));
                return { message: 'Committed Job' };
            } else {
                throw new BadRequestException({
                    message: 'dimensionType must be apart of infrastructureType Enum',
                    infrastructureType,
                });
            }
        } else if (passedInScheduleType === schedulerType.aggregation) {
            SchedulerService.logger.log('Schedule Type matches aggregation');
            // aggregation type is a parameter in schedule parameters that will determine if the schedule is associated with ebsVolume podUptime or ebsSnapshot aggregation
            // The client (other modules), to determine ebsVolume or ebsSnapshot, or pod Uptime, will need the measurementConfig instance (Agent | Infrastructure) and if its infrastructure, the resourceType (ebsVolume | ebsSnapshot)
            // Agent -> podUptime while Infrastructure -> ebsVolume | ebsSnapshot based on resource type
            if ('aggregationType' in scheduleParameters) {
                const { aggregationType: argumentAggType } = scheduleParameters;
                const response = await this.queue.add(
                    argumentAggType,
                    { ...schedulerEntity },
                    {
                        repeat: { cron: rate.toString() },
                        jobId: `${businessID}#${schedulerID}`,
                    }
                );

                SchedulerService.logger.log('Response from Queue Commit', JSON.stringify(response, null, 2));
                return { message: 'Committed Job' };
            }
        } else {
            const response = await this.queue.add(
                schedulerType.aggregation,
                { ...schedulerEntity },
                {
                    repeat: { cron: rate.toString() },
                    jobId: `${businessID}#${schedulerID}`,
                }
            );

            SchedulerService.logger.log('Response from Queue Commit', response);
            return { message: 'Committed Job' };
        }
    }

    static rateToDateTimeUtil(rate: rateEnum): { startTime: Date; endTime: Date } {
        SchedulerService.logger.log('getting a start and end time for rate', rate);

        if (rate === rateEnum['perMinute']) {
            const currentTime = Date.now();
            const endTime = new Date(currentTime);
            const MS_PER_MINUTE = 60000;
            const startTime = new Date(currentTime - MS_PER_MINUTE);
            const output = { startTime, endTime };
            SchedulerService.logger.log('Output for rate to time conversion', output);
            return output;
        } else if (rate === rateEnum['monthly']) {
        } else if (rate === rateEnum['annual']) {
        } else if (rate === rateEnum['weekly']) {
        } else {
            throw new NotImplementedException(`billing for rate: ${rate} is not implemented yet`);
        }
    }
    async emitOne({ schedulerId, payload }) {
        const { dimensionType, ...rest } = payload;
        const schedulerEntity = new SchedulerEntity({ schedulerID: schedulerId, ...rest });
        await this.queue.add(dimensionType, schedulerEntity);
        return { message: 'completed' };
    }
}
