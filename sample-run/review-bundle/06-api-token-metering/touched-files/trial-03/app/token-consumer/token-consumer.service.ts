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
import { OnboardingEntity } from '../users/entities/onboarding.entity';
import { DatetimeUtils } from '../utils/datetime';
import { TokenAsyncAggregatorDto } from './dto/schedulerAsyncProcessor.dto';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';
import { UsageEntity } from '../usage/entities/usage.entity';
import { ReadOfferingResponseData } from '../offering/dto/readOffering.dto';

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

    /**
     * Turn a token into billable usage against the platform's own account.
     * Production platform customers bill the production account and its dimension;
     * sandbox platform customers bill the sandbox pair.
     */
    async create(meteringcoToken: MeteringCoToken): Promise<BasicResponseDTO> {
        try {
            TokenConsumerService.logger.debug(
                `Metering Token for businessID: ${meteringcoToken?.businessID}, purpose: ${meteringcoToken?.metadata?.tokenType}`,
            );
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                meteringcoToken.businessID,
                meteringcoToken?.subject,
                this.environmentSerivce,
            );
            if (res) {
                const { meteringcoCustomerId, saasCustomerAssociatedBusinessID, meteringcoCustomer } = res;
                TokenConsumerService.logger.debug(`Metering Token for meteringco customerId: ${meteringcoCustomerId}`);
                const token = new MeteringCoToken(meteringcoToken);
                const dimensionId = TokenConsumerService.resolveDimensionId(
                    meteringcoCustomer,
                    token.metadata?.tokenType,
                    saasCustomerAssociatedBusinessID,
                );
                if (dimensionId) {
                    const entity = new StandardMeasurementEntity({
                        businessID: saasCustomerAssociatedBusinessID,
                        customerId: meteringcoCustomerId,
                        dimensionId,
                        recordValue: parseFloat(token.tokenAmount),
                        timestamp: token.timestamp,
                        metadata: token.metadata,
                        _measurement: UsageEntity._measurement,
                    });
                    StandardMeasurementEntity.publish(entity);
                } else {
                    TokenConsumerService.logger.warn(
                        `No dimension resolved for tokenType: ${token.metadata?.tokenType} on ${saasCustomerAssociatedBusinessID}`,
                    );
                }
                return { message: `Token Consumer created for businessID: ${meteringcoToken?.businessID}` };
            } else {
                TokenConsumerService.logger.error(`No customer found for businessID: ${meteringcoToken?.businessID}`);
                throw new BadRequestException(`No customer found for businessID: ${meteringcoToken?.businessID}`);
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
     * Record one API call against the platform customer for this tenant
     * in the aggregate bucket. flush=false so this does not add a round trip.
     */
    async registerApiCall({
        businessID,
        subject,
        amount = '1',
        timestamp,
        metadata,
    }: {
        businessID: string;
        subject?: string;
        amount?: string;
        timestamp?: string;
        metadata?: Record<string, string>;
    }): Promise<void> {
        await TokenConsumerService.registerApiCallStatic(
            { businessID, subject, amount, timestamp, metadata },
            this.environmentSerivce,
            this.influxService,
        );
    }

    public static async registerApiCallStatic(
        {
            businessID,
            subject,
            amount = '1',
            timestamp,
            metadata,
        }: {
            businessID: string;
            subject?: string;
            amount?: string;
            timestamp?: string;
            metadata?: Record<string, string>;
        },
        environmentSerivce?: EnvironmentService,
        influxService?: InfluxService,
    ): Promise<void> {
        try {
            if (!businessID) {
                return;
            }
            const res = await TokenConsumerService.getMeteringCoCustomerId(businessID, subject, environmentSerivce);
            if (!res) {
                return;
            }
            const { meteringcoCustomerId, saasCustomerAssociatedBusinessID } = res;
            const influx = influxService || new InfluxService();
            const token = new MeteringCoToken({
                businessID,
                subject,
                tokenAmount: amount ?? '1',
                timestamp: timestamp ?? new Date().toISOString(),
                metadata: {
                    tokenType: TokenType.apiCall,
                    ...(metadata || {}),
                },
            });
            const entity = new TokenConsumer(token, meteringcoCustomerId, saasCustomerAssociatedBusinessID);
            const points = TokenConsumer.transformer(entity, influx);
            // flush=false: recording a call must not add a round trip to the request it describes
            await influx.loadPoints(
                TokenConsumerAsyncProcessor.tokenAggregateBucket,
                process.env.INFLUX_ORG,
                points,
                false,
            );
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
     * Close a period: total one platform customer's registered traffic across a window
     * and bill it as a single token. Given none, close the six hours behind now.
     * A call belongs to the period its own moment falls in. Late arrivals stay at
     * that moment; a closed period is not re-opened to bill them.
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
                TokenConsumerService.logger.error(`No customer found for businessID: ${businessID}`);
                return;
            }
            const { meteringcoCustomerId } = res;
            const rows = await this.influxService.aggregateMeteringCoToken({
                customerId: meteringcoCustomerId,
                startDate: start,
                endDate: end,
            });
            const total = (rows || []).reduce((acc, row) => {
                const value = typeof row?._value === 'number' ? row._value : parseFloat(String(row?._value ?? 0));
                return acc + (Number.isFinite(value) ? value : 0);
            }, 0);
            TokenConsumerService.logger.debug(
                `Aggregated ${total} API calls for meteringco customer ${meteringcoCustomerId}`,
            );
            if (total > 0) {
                // The total becomes a single token for the period; create() turns it into billable usage.
                // Timestamp is the period end so a replay of the same window overwrites rather than double-bills.
                await this.create({
                    businessID,
                    subject,
                    tokenAmount: total.toString(),
                    timestamp: end.toISOString(),
                    metadata: {
                        tokenType: TokenType.apiCall,
                        managed: 'true',
                        periodStart: start.toISOString(),
                        periodEnd: end.toISOString(),
                    },
                });
            }
            return { message: `Closed token period for businessID: ${businessID}` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close token period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close token period',
                data: [serializeError(e)],
            });
        }
    }

    public static resolveDimensionId(
        meteringcoCustomer: ReadCustomerResponseData | undefined,
        tokenType: string | undefined,
        saasCustomerAssociatedBusinessID: string,
    ): string | undefined {
        const offering = meteringcoCustomer?.offering as
            | ReadOfferingResponseData
            | ReadOfferingResponseData[]
            | undefined;
        const offerings: ReadOfferingResponseData[] = Array.isArray(offering) ? offering : offering ? [offering] : [];
        for (const off of offerings) {
            const dims = off?.dimensions || [];
            const match = dims.find((d) => {
                const meta = d?.metadata || {};
                return (
                    meta['tokenType'] === tokenType ||
                    meta['entitlementType'] === tokenType ||
                    d?.dimensionName === tokenType ||
                    (tokenType === TokenType.apiCall && /api\s*call/i.test(d?.dimensionName || ''))
                );
            });
            if (match?.dimensionId) {
                return match.dimensionId;
            }
        }
        if (tokenType === TokenType.apiCall) {
            return TokenConsumerService.resolveApiCallDimensionId(saasCustomerAssociatedBusinessID);
        }
        return undefined;
    }

    public static resolveApiCallDimensionId(saasCustomerAssociatedBusinessID: string): string {
        if (saasCustomerAssociatedBusinessID === OnboardingEntity.dogfoodSandboxBusinessID) {
            return OnboardingEntity.dogfoodSandboxApiCallDimensionId;
        }
        return OnboardingEntity.dogfoodApiCallDimensionId;
    }

    public static isProductionPlatformAccount(saasCustomerAssociatedBusinessID: string): boolean {
        return saasCustomerAssociatedBusinessID === OnboardingEntity.dogfoodBusinessID;
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
            await this.schedulerService.create({
                businessID,
                schedulerStatus: SchedulerStatus.live,
                subject,
                schedulerID: TokenConsumerAsyncProcessor.aggregationSchedulerIdGenerator(businessID),
                schedulerType: schedulerType.dimensionDataGathering,
                scheduleParameters: {
                    businessID,
                    subject,
                    dimensionType: TokenConsumerAsyncProcessor.aggregationProcessor,
                } as TokenAsyncAggregatorDto,
                rate: SupportedMeasurementFrequencies.everySixHours,
            });
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
    async removeTokenProcessor({ businessID }: { businessID: string }): Promise<BasicResponseDTO | void> {
        try {
            TokenConsumerService.logger.debug(`Removing token processor for businessID: ${businessID}`);
            await this.schedulerService.remove({
                businessID,
                schedulerID: TokenConsumerAsyncProcessor.schedulerIdGenerator(businessID),
            });
            await this.schedulerService.remove({
                businessID,
                schedulerID: TokenConsumerAsyncProcessor.aggregationSchedulerIdGenerator(businessID),
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
