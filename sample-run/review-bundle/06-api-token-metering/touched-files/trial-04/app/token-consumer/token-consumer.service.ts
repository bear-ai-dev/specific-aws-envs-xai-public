import { BadRequestException, Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
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
import { UsageService } from '../usage/usage.service';
import { OnboardingEntity } from '../users/entities/onboarding.entity';

@Injectable()
export class TokenConsumerService {
    public static cacheKey = (businessID) => `${businessID}-tokenConsumer`;
    public static logger = new Logger(TokenConsumerService.name);
    public static productionAccount = 'meteringco-production';
    public static sandboxAccount = 'meteringco-sandbox';
    constructor(
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => LocalJWTAuthService)) readonly localJWTAuthService: LocalJWTAuthService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentSerivce: EnvironmentService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
        @Optional() @Inject(forwardRef(() => UsageService)) readonly usageService?: UsageService,
    ) {}
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
                if (this.usageService) {
                    const { account, dimensionId } = TokenConsumerService.resolvePlatformAccount(
                        saasCustomerAssociatedBusinessID,
                        meteringcoCustomer,
                        token.metadata?.tokenType,
                    );
                    await this.usageService.create({
                        businessID: account,
                        customerId: meteringcoCustomerId,
                        dimensionId,
                        recordValue: token.tokenAmount,
                        timestamp: token.timestamp,
                        metadata: {
                            ...(token.metadata || { tokenType: TokenType.apiCall }),
                            saasCustomerBusinessID: token.businessID,
                        },
                    });
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
     * Record one platform API call against the tenant's MeteringCo customer
     * in the aggregate bucket. Does not flush, so it adds no round trip.
     */
    async registerCall(meteringcoToken: MeteringCoToken): Promise<BasicResponseDTO | void> {
        try {
            const token = new MeteringCoToken(meteringcoToken);
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                token.businessID,
                token.subject,
                this.environmentSerivce,
            );
            if (!res) {
                TokenConsumerService.logger.error(`No customer found for businessID: ${token.businessID}`);
                return;
            }
            const { meteringcoCustomerId, saasCustomerAssociatedBusinessID } = res;
            const entity = new TokenConsumer(token, meteringcoCustomerId, saasCustomerAssociatedBusinessID);
            if (this.influxService) {
                const points = TokenConsumer.transformer(entity, this.influxService);
                await this.influxService.loadPoints(
                    TokenConsumerAsyncProcessor.tokenAggregateBucket,
                    process.env.INFLUX_ORG,
                    points,
                    false,
                );
            }
            return { message: `API call registered for businessID: ${token.businessID}` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to register API call', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to register API call',
                data: [serializeError(e)],
            });
        }
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
                },
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

    /**
     * Close a six-hour window of registered platform API traffic and bill the total
     * as a single token against the platform's own account. A late arrival whose
     * period has already been closed is still recorded at its own moment; the
     * closed period is not re-opened to bill it.
     */
    async closePeriod({
        businessID,
        startDate,
        endDate,
        subject,
    }: {
        businessID: string;
        startDate?: string;
        endDate?: string;
        subject?: string;
    }): Promise<BasicResponseDTO | void> {
        try {
            const window = TokenConsumerService.resolveCloseWindow(startDate, endDate);
            TokenConsumerService.logger.debug(
                `Closing token period for businessID: ${businessID} window: ${window.startDate.toISOString()} - ${window.endDate.toISOString()}`,
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
            const { meteringcoCustomerId, saasCustomerAssociatedBusinessID, meteringcoCustomer } = res;
            if (!this.influxService) {
                TokenConsumerService.logger.error('InfluxService unavailable, cannot close period');
                return;
            }
            const alreadyClosed = await this.isPeriodClosed({
                customerId: meteringcoCustomerId,
                startDate: window.startDate,
                endDate: window.endDate,
            });
            if (alreadyClosed) {
                TokenConsumerService.logger.debug(
                    `Period already closed for customer: ${meteringcoCustomerId} window: ${window.startDate.toISOString()}`,
                );
                return { message: `Period already closed for businessID: ${businessID}` };
            }
            const aggregated = await this.influxService.aggregateMeteringCoToken({
                customerId: meteringcoCustomerId,
                startDate: window.startDate,
                endDate: window.endDate,
            });
            const total = TokenConsumerService.sumAggregatedTokenAmount(aggregated);
            await this.influxService.loadPoints(
                TokenConsumerAsyncProcessor.tokenAggregateBucket,
                process.env.INFLUX_ORG,
                TokenConsumer.periodCloseTransformer(
                    {
                        customerId: meteringcoCustomerId,
                        businessID: saasCustomerAssociatedBusinessID,
                        startDate: window.startDate,
                        endDate: window.endDate,
                    },
                    this.influxService,
                ),
            );
            if (total > 0) {
                await this.create({
                    businessID,
                    subject,
                    tokenAmount: total.toString(),
                    timestamp: window.endDate.toISOString(),
                    metadata: {
                        tokenType: TokenType.apiCall,
                        startDate: window.startDate.toISOString(),
                        endDate: window.endDate.toISOString(),
                    },
                });
            }
            return { message: `Period closed for businessID: ${businessID}` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close token period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close token period',
                data: [serializeError(e)],
            });
        }
    }

    static resolveCloseWindow(startDate?: string, endDate?: string): { startDate: Date; endDate: Date } {
        if (startDate && endDate) {
            return { startDate: new Date(startDate), endDate: new Date(endDate) };
        }
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : DatetimeUtils.sixHoursAgo(end);
        return { startDate: start, endDate: end };
    }

    static sumAggregatedTokenAmount(rows: Array<{ _value?: string | number }>): number {
        if (!rows?.length) {
            return 0;
        }
        return rows.reduce((acc, row) => {
            const value = typeof row?._value === 'number' ? row._value : parseFloat(String(row?._value ?? 0));
            return acc + (Number.isFinite(value) ? value : 0);
        }, 0);
    }

    static resolvePlatformAccount(
        saasCustomerAssociatedBusinessID: string,
        meteringcoCustomer?: ReadCustomerResponseData,
        tokenType?: TokenType,
    ): { account: string; dimensionId: string } {
        const isProduction = TokenConsumerService.isProductionAccount(saasCustomerAssociatedBusinessID);
        const account = isProduction
            ? TokenConsumerService.productionAccount
            : TokenConsumerService.sandboxAccount;
        const dimensionId = TokenConsumerService.resolveApiCallDimension(
            meteringcoCustomer,
            isProduction,
            tokenType,
        );
        return { account, dimensionId };
    }

    static isProductionAccount(saasCustomerAssociatedBusinessID?: string): boolean {
        if (!saasCustomerAssociatedBusinessID) {
            return true;
        }
        if (saasCustomerAssociatedBusinessID === TokenConsumerService.sandboxAccount) {
            return false;
        }
        if (saasCustomerAssociatedBusinessID.includes('sandbox')) {
            return false;
        }
        return true;
    }

    static resolveApiCallDimension(
        meteringcoCustomer: ReadCustomerResponseData | undefined,
        isProduction: boolean,
        tokenType?: TokenType,
    ): string {
        const wanted = tokenType || TokenType.apiCall;
        const offering = meteringcoCustomer?.offering;
        const offerings = Array.isArray(offering) ? offering : offering ? [offering] : [];
        for (const off of offerings) {
            const dimensions = off?.dimensions || [];
            const match = dimensions.find((dimension) => {
                const name = (dimension as { dimensionName?: string })?.dimensionName?.toLowerCase?.() || '';
                const metadataType = (dimension as { metadata?: Record<string, unknown> })?.metadata?.tokenType;
                const entitlementType = (dimension as { metadata?: Record<string, unknown> })?.metadata
                    ?.entitlementType;
                return (
                    metadataType === wanted ||
                    entitlementType === wanted ||
                    name.includes(String(wanted).toLowerCase()) ||
                    name.includes('apicall') ||
                    name.includes('api call')
                );
            });
            if (match?.dimensionId) {
                return match.dimensionId;
            }
        }
        return isProduction
            ? OnboardingEntity.dogfoodApiCallDimensionId
            : OnboardingEntity.dogfoodSandboxApiCallDimensionId;
    }

    async isPeriodClosed({
        customerId,
        startDate,
        endDate,
    }: {
        customerId: string;
        startDate: Date;
        endDate: Date;
    }): Promise<boolean> {
        const queryApi = this.influxService.queryAPIInstance();
        const query = `from(bucket: "${TokenConsumerAsyncProcessor.tokenAggregateBucket}")
        |> range(start: ${startDate.toISOString()}, stop: ${endDate.toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${TokenConsumer.periodCloseMeasurement}")
        |> filter(fn: (r) => exists r.customerId)
        |> filter(fn: (r) => r["customerId"] == "${customerId}")
        |> filter(fn: (r) => r["startDate"] == "${startDate.toISOString()}")
        |> limit(n: 1)`;
        const res = await queryApi.collectRows(query);
        return res.length > 0;
    }
}
