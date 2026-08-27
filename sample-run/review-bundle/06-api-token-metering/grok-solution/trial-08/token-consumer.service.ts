import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { MeteringCoToken } from './dto/meteringcoToken.dto';
import { UserEntitlements } from '../users/entities/entitlement.entity';
import { cache as cacheManager } from '../cacheStore.js';
import { BasicResponseDTO } from '../basicResponseDTO';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { serializeError } from 'serialize-error';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SchedulerStatus, SupportedMeasurementFrequencies, schedulerType } from '../scheduler/dto/scheduler.dto';
import { TokenConsumerAsyncProcessor } from './token-consumer-async-processor';
import { ReadCustomerResponseData } from '../customer/entities/customer.entity';
import { LocalJWTAuthService } from '../authz/jwt-local.strategy';
import { EnvironmentService } from '../users/users.service';
import { InfluxService } from '../influx/influx.service';
import { TokenConsumer } from './entities/token-consumer.entity';
import { TokenType } from './dto/TokenType';
import { DatetimeUtils } from '../utils/datetime';
import { MeteringCoTokenMetadata } from './dto/MeteringCoTokenMetadata';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';
import { UsageEntity } from '../usage/entities/usage.entity';

@Injectable()
export class TokenConsumerService {
    public static cacheKey = (businessID) => `${businessID}-tokenConsumer`;
    public static logger = new Logger(TokenConsumerService.name);
    constructor(
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => LocalJWTAuthService)) readonly localJWTAuthService: LocalJWTAuthService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentSerivce: EnvironmentService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
    ) {}
    async create(meteringcoToken: MeteringCoToken): Promise<BasicResponseDTO> {
        try {
            const token = new MeteringCoToken(meteringcoToken);
            TokenConsumerService.logger.debug(
                `Metering Token for businessID: ${token?.businessID}, purpose: ${token?.metadata?.tokenType}`,
            );
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                token.businessID,
                token?.subject,
                this.environmentSerivce,
            );
            if (res) {
                const { meteringcoCustomerId, saasCustomerAssociatedBusinessID, meteringcoCustomer } = res;
                TokenConsumerService.logger.debug(`Metering Token for meteringco customerId: ${meteringcoCustomerId}`);
                const dimensionId = TokenConsumerService.resolvePlatformDimensionId({
                    saasCustomerAssociatedBusinessID,
                    meteringcoCustomer,
                    tokenType: token?.metadata?.tokenType,
                });
                if (dimensionId) {
                    const usageEntity = new StandardMeasurementEntity({
                        businessID: saasCustomerAssociatedBusinessID,
                        customerId: meteringcoCustomerId,
                        dimensionId,
                        recordValue: parseFloat(token.tokenAmount),
                        timestamp: token.timestamp,
                        metadata: token.metadata,
                        _measurement: UsageEntity._measurement,
                    });
                    StandardMeasurementEntity.publish(usageEntity);
                } else {
                    TokenConsumerService.logger.error(
                        `No platform dimension found for businessID: ${token?.businessID}, platform account: ${saasCustomerAssociatedBusinessID}`,
                    );
                }
                return { message: `Token Consumer created for businessID: ${token?.businessID}` };
            } else {
                TokenConsumerService.logger.error(`No customer found for businessID: ${token?.businessID}`);
                throw new BadRequestException(`No customer found for businessID: ${token?.businessID}`);
            }
        } catch (e) {
            TokenConsumerService.logger.error('Failed to create Token Consumer', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to create Token Consumer',
                data: [serializeError(e)],
            });
        }
    }

    /**
     * Record one platform API call against the tenant's MeteringCo customer.
     * Writes to the aggregate bucket without flushing so it does not add a
     * round trip to the request it describes. The call is stored at its own
     * moment so late / duplicate arrivals land in the period they happened in.
     */
    async registerCall({
        businessID,
        subject,
        tokenAmount = '1',
        timestamp,
        metadata,
    }: {
        businessID: string;
        subject?: string;
        tokenAmount?: string;
        timestamp?: string;
        metadata?: MeteringCoTokenMetadata;
    }): Promise<void> {
        return TokenConsumerService.registerCall({
            businessID,
            subject,
            tokenAmount,
            timestamp,
            metadata,
            environmentService: this.environmentSerivce,
            influxService: this.influxService,
        });
    }

    public static async registerCall({
        businessID,
        subject,
        tokenAmount = '1',
        timestamp,
        metadata,
        environmentService,
        influxService,
    }: {
        businessID: string;
        subject?: string;
        tokenAmount?: string;
        timestamp?: string;
        metadata?: MeteringCoTokenMetadata;
        environmentService?: EnvironmentService;
        influxService?: InfluxService;
    }): Promise<void> {
        try {
            if (!businessID) {
                return;
            }
            const influx = influxService ?? new InfluxService();
            const res = await TokenConsumerService.getMeteringCoCustomerId(businessID, subject, environmentService);
            if (!res) {
                return;
            }
            const { meteringcoCustomerId, saasCustomerAssociatedBusinessID } = res;
            const token = new MeteringCoToken({
                businessID,
                tokenAmount,
                subject,
                timestamp,
                metadata: metadata ?? { tokenType: TokenType.apiCall },
            });
            const entity = new TokenConsumer(token, meteringcoCustomerId, saasCustomerAssociatedBusinessID);
            const points = TokenConsumer.transformer(entity, influx);
            // flush=false: buffer the write, do not add a round trip to the described request
            await influx.loadPoints(TokenConsumerAsyncProcessor.tokenAggregateBucket, influx.org, points, false);
        } catch (e) {
            TokenConsumerService.logger.error('Failed to register API call', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to register API call',
                data: [serializeError(e)],
            });
        }
    }

    /**
     * Total one platform customer's registered traffic across a window and
     * turn that total into a single billable token. With no window, close the
     * six hours behind now. Does not reopen a previously billed period.
     */
    async closePeriod({
        businessID,
        subject,
        startDate,
        endDate,
    }: {
        businessID: string;
        subject?: string;
        startDate?: string | Date;
        endDate?: string | Date;
    }): Promise<BasicResponseDTO | void> {
        try {
            const end = endDate ? new Date(endDate) : new Date();
            const start = startDate ? new Date(startDate) : DatetimeUtils.sixHoursAgo(end);
            TokenConsumerService.logger.debug(
                `Closing token period for businessID: ${businessID} window: ${start.toISOString()} - ${end.toISOString()}`,
            );
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                businessID,
                subject,
                this.environmentSerivce,
            );
            if (!res) {
                TokenConsumerService.logger.error(`No customer found for businessID: ${businessID} while closing period`);
                return;
            }
            const { meteringcoCustomerId } = res;
            // Drain any buffered registerCall writes so the window we close is complete.
            if (this.influxService.writeApis?.[TokenConsumerAsyncProcessor.tokenAggregateBucket]) {
                await this.influxService.writeApis[TokenConsumerAsyncProcessor.tokenAggregateBucket].flush();
            }
            const rows = await this.influxService.aggregateMeteringCoToken({
                customerId: meteringcoCustomerId,
                startDate: start,
                endDate: end,
            });
            const total = rows?.[0]?._value ?? 0;
            return this.create({
                businessID,
                subject,
                tokenAmount: total.toString(),
                timestamp: start.toISOString(),
                metadata: {
                    tokenType: TokenType.apiCall,
                    periodStart: start.toISOString(),
                    periodEnd: end.toISOString(),
                },
            });
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close token period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close token period',
                data: [serializeError(e)],
            });
        }
    }

    public static resolvePlatformDimensionId({
        saasCustomerAssociatedBusinessID,
        meteringcoCustomer,
        tokenType,
    }: {
        saasCustomerAssociatedBusinessID: string;
        meteringcoCustomer?: ReadCustomerResponseData;
        tokenType?: TokenType | string;
    }): string | undefined {
        const offering = meteringcoCustomer?.offering;
        const offerings = offering ? (Array.isArray(offering) ? offering : [offering]) : [];
        const dimensions = offerings.flatMap((off) => off?.dimensions ?? []);
        if (tokenType) {
            const matched = dimensions.find((dimension) => {
                const meta = dimension?.metadata ?? {};
                return (
                    meta.tokenType?.toString() === tokenType.toString() ||
                    meta.entitlementType?.toString() === tokenType.toString()
                );
            });
            if (matched?.dimensionId) {
                return matched.dimensionId;
            }
        }
        if (dimensions[0]?.dimensionId) {
            return dimensions[0].dimensionId;
        }
        // Fall back to the production / sandbox pair when the customer record has no dimensions
        if (saasCustomerAssociatedBusinessID === 'meteringco-production') {
            return 'meteringco-production-api-call';
        }
        return 'meteringco-sandbox-api-call';
    }

    public static async getMeteringCoCustomerId(
        businessID: string,
        subject?: string,
        environmentSerivce?: EnvironmentService,
    ): Promise<{
        meteringcoCustomerId: string;
        saasCustomerAssociatedBusinessID: string;
        meteringcoCustomer: ReadCustomerResponseData;
    } | void> {
        const jsonBlob: string = await cacheManager.get(TokenConsumerService.cacheKey(businessID));
        let meteringcoCustomerId: string;
        let saasCustomerAssociatedBusinessID: string;
        let meteringcoCustomer: ReadCustomerResponseData;
        if (!jsonBlob) {
            let businessIDs: string[] = [];
            if (subject) {
                const allEnvs = await environmentSerivce.getEnvironmentsForUser(subject);
                businessIDs = allEnvs.map((env) => env.businessID);
            } else {
                businessIDs = [businessID];
            }
            const { data } = await UserEntitlements.queryForMeteringCoCustomer({
                businessIDs,
            });
            if (data.length) {
                TokenConsumerService.logger.debug(
                    `Storing customer: ${data[0].customerId} for businessID: ${data[0].businessID} in token cache`,
                );
                await cacheManager.set(
                    TokenConsumerService.cacheKey(businessID),
                    JSON.stringify({
                        customerId: data[0].customerId,
                        saasCustomerAssociatedBusinessID: data[0].businessID,
                        customerRes: data[0],
                    }),
                );
            } else {
                TokenConsumerService.logger.error(`No customer found for businessID: ${businessID}`);
                return;
            }
            meteringcoCustomerId = data[0].customerId;
            saasCustomerAssociatedBusinessID = data[0].businessID;
            meteringcoCustomer = data[0];
        } else {
            const parsedJson = JSON.parse(jsonBlob);
            TokenConsumerService.logger.debug(
                `Retrieved customer: ${parsedJson.customerId} from token cache with MeteringCoBusinessID: ${parsedJson.saasCustomerAssociatedBusinessID}`,
            );
            meteringcoCustomerId = parsedJson.customerId;
            saasCustomerAssociatedBusinessID = parsedJson.saasCustomerAssociatedBusinessID;
            meteringcoCustomer = parsedJson.customerRes;
        }
        return { meteringcoCustomerId, saasCustomerAssociatedBusinessID, meteringcoCustomer };
    }
    async scheduleTokenProcessor({
        businessID,
        subject,
    }: {
        businessID: string;
        subject: string;
    }): Promise<BasicResponseDTO | void> {
        try {
            TokenConsumerService.logger.debug(`Scheduling token processor for businessID: ${businessID}`);
            await this.schedulerService.create({
                businessID,
                schedulerStatus: SchedulerStatus.live,
                subject,
                schedulerID: TokenConsumerAsyncProcessor.schedulerIdGenerator(businessID),
                schedulerType: schedulerType.dimensionDataGathering,
                scheduleParameters: {
                    businessID,
                    subject,
                    dimensionType: TokenConsumerAsyncProcessor.processorName,
                },
                rate: SupportedMeasurementFrequencies.monthlyAtNoon,
            });
            await this.scheduleTokenAggregator({ businessID, subject });
            return { message: `Token Processor scheduled for businessID: ${businessID}` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to schedule token processor', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to schedule token processor',
                data: [serializeError(e)],
            });
        }
    }

    async scheduleTokenAggregator({
        businessID,
        subject,
    }: {
        businessID: string;
        subject: string;
    }): Promise<BasicResponseDTO | void> {
        try {
            TokenConsumerService.logger.debug(`Scheduling token aggregator for businessID: ${businessID}`);
            await this.schedulerService.create({
                businessID,
                schedulerStatus: SchedulerStatus.live,
                subject,
                schedulerID: TokenConsumerAsyncProcessor.aggregatorSchedulerIdGenerator(businessID),
                schedulerType: schedulerType.dimensionDataGathering,
                scheduleParameters: {
                    businessID,
                    subject,
                    dimensionType: TokenConsumerAsyncProcessor.aggregationProcessor,
                },
                rate: SupportedMeasurementFrequencies.everySixHours,
            });
            return { message: `Token Aggregator scheduled for businessID: ${businessID}` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to schedule token aggregator', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to schedule token aggregator',
                data: [serializeError(e)],
            });
        }
    }

    async removeTokenProcessor({ businessID }: { businessID: string }): Promise<BasicResponseDTO | void> {
        try {
            TokenConsumerService.logger.debug(`Removing token processor for businessID: ${businessID}`);
            await this.schedulerService.remove({
                businessID,
                schedulerID: TokenConsumerAsyncProcessor.schedulerIdGenerator(businessID),
            });
            await this.schedulerService.remove({
                businessID,
                schedulerID: TokenConsumerAsyncProcessor.aggregatorSchedulerIdGenerator(businessID),
            });
            return { message: `Token Processor removed for businessID: ${businessID}` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to remove token processor', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to remove token processor',
                data: [serializeError(e)],
            });
        }
    }

    async findAll({ businessID }: { businessID: string }): Promise<{ access_token: string }> {
        try {
            const res = await TokenConsumerService.getMeteringCoCustomerId(businessID);
            if (res) {
                TokenConsumerService.logger.debug(`Finding meteringco token usage for businessID: ${businessID}`);
                const { meteringcoCustomerId, saasCustomerAssociatedBusinessID, meteringcoCustomer } = res;

                const tokenUsageRes = await this.localJWTAuthService.signIn(
                    meteringcoCustomerId,
                    saasCustomerAssociatedBusinessID,
                );
                TokenConsumerService.logger.debug(
                    `Found meteringco token usage for businessID: ${businessID}, meteringcoCustomerId: ${meteringcoCustomerId} and saasCustomerAssociatedBusinessID: ${saasCustomerAssociatedBusinessID}`,
                );
                return tokenUsageRes;
            } else {
                return { access_token: '' };
            }
        } catch (e) {
            TokenConsumerService.logger.error('Failed to find meteringco token usage', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to find meteringco token usage',
                data: [serializeError(e)],
            });
            return { access_token: '' };
        }
    }
}
