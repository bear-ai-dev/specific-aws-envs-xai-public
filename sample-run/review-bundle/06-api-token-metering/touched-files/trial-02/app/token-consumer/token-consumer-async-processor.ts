import { Inject, Logger, forwardRef } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { TokenConsumerService } from './token-consumer.service';
import { SchedulerEntity } from '../scheduler/entities/scheduler.entity';
import { Job } from 'bull';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { OfferingService } from '../offering/offering.service';
import { CustomerService } from '../customer/customer.service';
import { DimensionsService } from '../dimensions/dimensions.service';
import { TokenType } from './dto/TokenType';
import { TokenAsyncAggregatorDto } from './dto/schedulerAsyncProcessor.dto';
import { Cron } from '@nestjs/schedule';
import { InfluxService } from '../influx/influx.service';
import { CustomerEntity } from '../customer/entities/customer.entity';

@Processor('scheduler_queue')
export class TokenConsumerAsyncProcessor {
    public static processorName = 'token-consumer-async-processor';
    public static aggregationProcessor = 'aggregation-processor';
    public static tokenAggregateBucket = 'dogfood-aggregate-bucket';
    public static schedulerIdGenerator = (businessID: string) =>
        `${TokenConsumerAsyncProcessor.processorName}-${businessID}`;
    public static aggregationSchedulerIdGenerator = (businessID: string) =>
        `${TokenConsumerAsyncProcessor.aggregationProcessor}-${businessID}`;
    private static readonly logger = new Logger(TokenConsumerAsyncProcessor.name);
    constructor(
        @Inject(forwardRef(() => TokenConsumerService)) readonly tokenConsumerService: TokenConsumerService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService,
        @Inject(forwardRef(() => CustomerService)) readonly customerService: CustomerService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionService: DimensionsService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
    ) {}

    @Cron('0 */6 * * *')
    async scheduledClose() {
        TokenConsumerAsyncProcessor.logger.log('Running scheduled six-hour token aggregation');
        try {
            await this.closeAllPlatformCustomers();
        } catch (e) {
            TokenConsumerAsyncProcessor.logger.error('Failed scheduled token aggregation', e);
        }
    }

    async closeAllPlatformCustomers(startDate?: Date, endDate?: Date) {
        const customers = await InfluxService.getMeteringCoCustomers();
        for (const row of customers || []) {
            const entity = CustomerEntity.dbModelToEntity(row);
            if (!entity?.customerId) {
                continue;
            }
            await this.tokenConsumerService.closePeriod({
                customerId: entity.customerId,
                businessID: entity.businessID,
                startDate,
                endDate,
            });
        }
    }
    @Process(TokenConsumerAsyncProcessor.processorName)
    async loadTokens({ data: { subject, rate, businessID } }: Job<SchedulerEntity>) {
        TokenConsumerAsyncProcessor.logger.log('Processing Automated Token loading event, logging inputs', {
            rate,
            businessID,
            subject,
        });
        try {
            const { data: offeringData } = await this.offeringService.findAll({ businessID });
            const { data: customerData } = await this.customerService.findAll({ businessID });
            const { data: dimensionData } = await this.dimensionService.findAll({ businessID });

            if (offeringData?.length) {
                await this.tokenConsumerService.create({
                    businessID,
                    tokenAmount: offeringData.length.toString(),
                    metadata: {
                        tokenType: TokenType.offering,
                        managed: 'true',
                    },
                });
            }
            if (customerData?.length) {
                await this.tokenConsumerService.create({
                    businessID,
                    tokenAmount: customerData.length.toString(),
                    metadata: {
                        tokenType: TokenType.customer,
                        managed: 'true',
                    },
                });
            }

            if (dimensionData?.length) {
                await this.tokenConsumerService.create({
                    businessID,
                    tokenAmount: dimensionData.length.toString(),
                    metadata: {
                        tokenType: TokenType.metric,
                        managed: 'true',
                    },
                });
            }
        } catch (e) {
            TokenConsumerAsyncProcessor.logger.error('Failed to load tokens', e);
            throw e;
        }
    }
    @OnQueueFailed({ name: TokenConsumerAsyncProcessor.processorName })
    jobFailure(job: Job) {
        AuditService.publishEvent({
            message: 'Failed to load tokens',
            data: job.data,
            topic: AuditScope.ERROR,
        });
    }

    @Process(TokenConsumerAsyncProcessor.aggregationProcessor)
    async aggregateTokens({ data }: Job<SchedulerEntity>) {
        const { businessID, subject, scheduleParameters } = data;
        const params = (scheduleParameters || {}) as TokenAsyncAggregatorDto;
        TokenConsumerAsyncProcessor.logger.log('Processing token aggregation event', {
            businessID,
            subject,
            startDate: params?.startDate,
            endDate: params?.endDate,
        });
        try {
            const startDate = params?.startDate ? new Date(params.startDate) : undefined;
            const endDate = params?.endDate ? new Date(params.endDate) : undefined;
            await this.tokenConsumerService.closePeriod({
                businessID,
                subject,
                startDate,
                endDate,
            });
        } catch (e) {
            TokenConsumerAsyncProcessor.logger.error('Failed to aggregate tokens', e);
            throw e;
        }
    }

    @OnQueueFailed({ name: TokenConsumerAsyncProcessor.aggregationProcessor })
    aggregationJobFailure(job: Job) {
        AuditService.publishEvent({
            message: 'Failed to aggregate tokens',
            data: job.data,
            topic: AuditScope.ERROR,
        });
    }
}
