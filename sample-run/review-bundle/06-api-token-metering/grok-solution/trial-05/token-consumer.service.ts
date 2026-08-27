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
import { UsageEntity } from '../usage/entities/usage.entity';
import { TokenType } from './dto/TokenType';
import { DatetimeUtils } from '../utils/datetime';
import { randomUUID } from 'crypto';

export const API_CALL_AMOUNT = 0.001;
export const METERINGCO_PRODUCTION_BUSINESS_ID = 'meteringco-production';
export const METERINGCO_SANDBOX_BUSINESS_ID = 'meteringco-sandbox';
export const METERINGCO_PRODUCTION_DIMENSION_ID = '697f07d0-3180-4351-bdff-7ca029e6c18d';
export const METERINGCO_SANDBOX_DIMENSION_ID = '00abdf4f-f975-41c6-8293-76ba09a5cb23';

export type RegisterApiCallInput = {
    businessID: string;
    subject?: string;
    amount?: number | string;
    moment?: Date | string;
    metadata?: Record<string, string>;
    meteringcoCustomerId?: string;
    saasCustomerAssociatedBusinessID?: string;
    meteringcoCustomer?: ReadCustomerResponseData;
};

@Injectable()
export class TokenConsumerService {
    public static cacheKey = (businessID) => `${businessID}-tokenConsumer`;
    public static logger = new Logger(TokenConsumerService.name);
    private readonly closedPeriods = new Set<string>();
    constructor(
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => LocalJWTAuthService)) readonly localJWTAuthService: LocalJWTAuthService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentSerivce: EnvironmentService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
    ) {}
    async create(
        meteringcoToken: MeteringCoToken & {
            meteringcoCustomerId?: string;
            saasCustomerAssociatedBusinessID?: string;
            meteringcoCustomer?: ReadCustomerResponseData;
        },
    ): Promise<BasicResponseDTO> {
        try {
            TokenConsumerService.logger.debug(
                `Metering Token for businessID: ${meteringcoToken?.businessID}, purpose: ${meteringcoToken?.metadata?.tokenType}`,
            );
            const token = new MeteringCoToken(meteringcoToken);
            let meteringcoCustomerId = meteringcoToken.meteringcoCustomerId;
            let saasCustomerAssociatedBusinessID = meteringcoToken.saasCustomerAssociatedBusinessID;
            let meteringcoCustomer = meteringcoToken.meteringcoCustomer;
            if (!meteringcoCustomerId || !saasCustomerAssociatedBusinessID) {
                const res = await TokenConsumerService.getMeteringCoCustomerId(
                    token.businessID,
                    token?.subject,
                    this.environmentSerivce,
                );
                if (res) {
                    meteringcoCustomerId = meteringcoCustomerId || res.meteringcoCustomerId;
                    saasCustomerAssociatedBusinessID =
                        saasCustomerAssociatedBusinessID || res.saasCustomerAssociatedBusinessID;
                    meteringcoCustomer = meteringcoCustomer || res.meteringcoCustomer;
                }
            }
            if (meteringcoCustomerId) {
                TokenConsumerService.logger.debug(`Metering Token for meteringco customerId: ${meteringcoCustomerId}`);
                const platformAccount = TokenConsumerService.resolvePlatformAccount(
                    saasCustomerAssociatedBusinessID,
                    meteringcoCustomer,
                );
                const dimensionId = TokenConsumerService.resolvePlatformDimensionId(
                    platformAccount,
                    meteringcoCustomer,
                    token.metadata?.tokenType,
                );
                const point = TokenConsumer.transformer(
                    {
                        customerId: meteringcoCustomerId,
                        businessID: platformAccount,
                        dimensionId,
                        tokenAmount: token.tokenAmount,
                        timestamp: token.timestamp,
                        metadata: token.metadata,
                        measurement: UsageEntity._measurement,
                    },
                    this.influxService,
                );
                await this.influxService.loadPoints(
                    `${process.env.STAGE}-usage-data`,
                    process.env.INFLUX_ORG,
                    [point],
                    true,
                );
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
     * in the aggregate bucket. Does not flush — the request this describes
     * must not wait on a round trip.
     */
    async registerApiCall({
        businessID,
        subject,
        amount,
        moment,
        metadata,
        meteringcoCustomerId,
        saasCustomerAssociatedBusinessID,
        meteringcoCustomer,
    }: RegisterApiCallInput): Promise<void> {
        try {
            let customerId = meteringcoCustomerId;
            let platformBusinessID = saasCustomerAssociatedBusinessID;
            let customer = meteringcoCustomer;
            if (!customerId || !platformBusinessID) {
                const res = await TokenConsumerService.getMeteringCoCustomerId(
                    businessID,
                    subject,
                    this.environmentSerivce,
                );
                if (!res) {
                    return;
                }
                customerId = res.meteringcoCustomerId;
                platformBusinessID = res.saasCustomerAssociatedBusinessID;
                customer = res.meteringcoCustomer;
            }
            const platformAccount = TokenConsumerService.resolvePlatformAccount(platformBusinessID, customer);
            const dimensionId = TokenConsumerService.resolvePlatformDimensionId(
                platformAccount,
                customer,
                TokenType.apiCall,
            );
            const timestamp = moment
                ? moment instanceof Date
                    ? moment.toISOString()
                    : new Date(moment).toISOString()
                : new Date().toISOString();
            const recordAmount = amount === undefined || amount === null ? API_CALL_AMOUNT : amount;
            const point = TokenConsumer.transformer(
                {
                    customerId,
                    businessID: platformAccount,
                    dimensionId,
                    tokenAmount: recordAmount,
                    timestamp,
                    metadata: {
                        tokenType: TokenType.apiCall,
                        ...(metadata || {}),
                    },
                    measurement: TokenConsumer._measurement,
                },
                this.influxService,
            );
            await this.influxService.loadPoints(
                TokenConsumerAsyncProcessor.tokenAggregateBucket,
                process.env.INFLUX_ORG,
                [point],
                false,
            );
            // Flush in the background so the described request is not charged a
            // round trip, while the point still reaches the store.
            void this.influxService.loadPoints(
                TokenConsumerAsyncProcessor.tokenAggregateBucket,
                process.env.INFLUX_ORG,
                [],
                true,
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
     * Close a window of registered platform traffic and turn the total into
     * a single billable token. A missing window closes the six hours behind now.
     * Already-closed windows are left alone so a late or duplicate arrival
     * cannot move an issued invoice.
     */
    async closePeriod({
        startDate,
        endDate,
        businessID,
        subject,
        customerId,
    }: {
        startDate?: Date | string;
        endDate?: Date | string;
        businessID?: string;
        subject?: string;
        customerId?: string;
    } = {}): Promise<BasicResponseDTO | void> {
        try {
            await this.flushAggregateBucket();
            const window = TokenConsumerService.resolveWindow(startDate, endDate);
            const targets = await this.resolveCloseTargets({ businessID, subject, customerId });
            for (const target of targets) {
                const periodKey = `${target.meteringcoCustomerId}:${window.startDate.toISOString()}:${window.endDate.toISOString()}`;
                if (this.closedPeriods.has(periodKey)) {
                    TokenConsumerService.logger.debug(`Period already closed: ${periodKey}`);
                    continue;
                }
                const alreadyBilled =
                    typeof this.influxService.findMeteringCoTokenUsage === 'function'
                        ? await this.influxService.findMeteringCoTokenUsage({
                              customerId: target.meteringcoCustomerId,
                              startDate: window.startDate,
                              endDate: new Date(window.endDate.getTime() + 60 * 1000),
                          })
                        : [];
                if (alreadyBilled?.length) {
                    this.closedPeriods.add(periodKey);
                    TokenConsumerService.logger.debug(`Period already billed in store: ${periodKey}`);
                    continue;
                }
                const aggregated = await this.influxService.aggregateMeteringCoToken({
                    customerId: target.meteringcoCustomerId,
                    startDate: window.startDate,
                    endDate: window.endDate,
                });
                const total = TokenConsumerService.sumAggregatedToken(aggregated);
                this.closedPeriods.add(periodKey);
                if (total === 0) {
                    TokenConsumerService.logger.debug(
                        `No platform traffic to bill for customer ${target.meteringcoCustomerId} in ${periodKey}`,
                    );
                    continue;
                }
                await this.create({
                    businessID: target.tenantBusinessID || target.saasCustomerAssociatedBusinessID,
                    subject,
                    tokenAmount: total.toString(),
                    timestamp: window.endDate.toISOString(),
                    metadata: {
                        tokenType: TokenType.apiCall,
                        managed: 'true',
                    },
                    meteringcoCustomerId: target.meteringcoCustomerId,
                    saasCustomerAssociatedBusinessID: target.saasCustomerAssociatedBusinessID,
                    meteringcoCustomer: target.meteringcoCustomer,
                });
            }
            return { message: 'Closed platform API traffic period' };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close platform API traffic period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close platform API traffic period',
                data: [serializeError(e)],
            });
        }
    }

    async flushAggregateBucket(): Promise<void> {
        const writeApi = this.influxService.writeApis?.[TokenConsumerAsyncProcessor.tokenAggregateBucket];
        if (writeApi) {
            await writeApi.flush();
        }
    }

    private async resolveCloseTargets({
        businessID,
        subject,
        customerId,
    }: {
        businessID?: string;
        subject?: string;
        customerId?: string;
    }): Promise<
        Array<{
            meteringcoCustomerId: string;
            saasCustomerAssociatedBusinessID: string;
            meteringcoCustomer?: ReadCustomerResponseData;
            tenantBusinessID?: string;
        }>
    > {
        if (customerId) {
            const res = businessID
                ? await TokenConsumerService.getMeteringCoCustomerId(businessID, subject, this.environmentSerivce)
                : undefined;
            const resolved = res || undefined;
            return [
                {
                    meteringcoCustomerId: customerId,
                    saasCustomerAssociatedBusinessID:
                        (resolved && resolved.saasCustomerAssociatedBusinessID) ||
                        TokenConsumerService.inferPlatformAccountFromCustomerId(customerId),
                    meteringcoCustomer: resolved ? resolved.meteringcoCustomer : undefined,
                    tenantBusinessID: businessID,
                },
            ];
        }
        if (
            businessID &&
            businessID !== METERINGCO_PRODUCTION_BUSINESS_ID &&
            businessID !== METERINGCO_SANDBOX_BUSINESS_ID
        ) {
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                businessID,
                subject,
                this.environmentSerivce,
            );
            if (res) {
                return [
                    {
                        meteringcoCustomerId: res.meteringcoCustomerId,
                        saasCustomerAssociatedBusinessID: res.saasCustomerAssociatedBusinessID,
                        meteringcoCustomer: res.meteringcoCustomer,
                        tenantBusinessID: businessID,
                    },
                ];
            }
        }
        const platformCustomers = await InfluxService.getMeteringCoCustomers();
        const filtered = (platformCustomers || []).filter((row) => {
            if (customerId) {
                return row.customerId === customerId;
            }
            if (businessID === METERINGCO_PRODUCTION_BUSINESS_ID || businessID === METERINGCO_SANDBOX_BUSINESS_ID) {
                return row.businessID === businessID;
            }
            return true;
        });
        return filtered.map((row) => ({
            meteringcoCustomerId: row.customerId,
            saasCustomerAssociatedBusinessID: row.businessID,
            tenantBusinessID: TokenConsumerService.tenantBusinessIdFromMetadata(row.metadata),
        }));
    }

    static resolveWindow(
        startDate?: Date | string,
        endDate?: Date | string,
    ): { startDate: Date; endDate: Date } {
        if (startDate && endDate) {
            return { startDate: new Date(startDate), endDate: new Date(endDate) };
        }
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : DatetimeUtils.sixHoursAgo(end);
        return { startDate: start, endDate: end };
    }

    static sumAggregatedToken(rows: Array<{ _value?: string | number | boolean }>): number {
        if (!rows?.length) {
            return 0;
        }
        return rows.reduce((acc, row) => {
            const value = row?._value;
            if (typeof value === 'number') {
                return acc + value;
            }
            if (typeof value === 'string' && value !== '') {
                const parsed = parseFloat(value);
                return Number.isNaN(parsed) ? acc : acc + parsed;
            }
            return acc;
        }, 0);
    }

    static resolvePlatformAccount(
        saasCustomerAssociatedBusinessID?: string,
        meteringcoCustomer?: ReadCustomerResponseData,
    ): string {
        const candidate = saasCustomerAssociatedBusinessID || meteringcoCustomer?.businessID;
        if (candidate === METERINGCO_SANDBOX_BUSINESS_ID) {
            return METERINGCO_SANDBOX_BUSINESS_ID;
        }
        if (candidate === METERINGCO_PRODUCTION_BUSINESS_ID) {
            return METERINGCO_PRODUCTION_BUSINESS_ID;
        }
        return candidate || METERINGCO_PRODUCTION_BUSINESS_ID;
    }

    static resolvePlatformDimensionId(
        platformAccount: string,
        meteringcoCustomer?: ReadCustomerResponseData,
        tokenType?: string,
    ): string {
        const offering = meteringcoCustomer?.offering;
        const dimensions = Array.isArray(offering)
            ? offering.flatMap((item) => item?.dimensions || [])
            : offering?.dimensions || [];
        if (dimensions.length) {
            if (tokenType) {
                const named = dimensions.find(
                    (dimension) =>
                        dimension?.dimensionName?.toLowerCase() === 'api call' ||
                        dimension?.dimensionName?.toLowerCase() === tokenType.toLowerCase() ||
                        dimension?.metadata?.tokenType === tokenType ||
                        dimension?.metadata?.entitlementType === tokenType,
                );
                if (named?.dimensionId) {
                    return named.dimensionId;
                }
            }
            if (dimensions[0]?.dimensionId) {
                return dimensions[0].dimensionId;
            }
        }
        return platformAccount === METERINGCO_SANDBOX_BUSINESS_ID
            ? METERINGCO_SANDBOX_DIMENSION_ID
            : METERINGCO_PRODUCTION_DIMENSION_ID;
    }

    static inferPlatformAccountFromCustomerId(customerId: string): string {
        if (customerId?.includes('sbx') || customerId?.includes('sandbox')) {
            return METERINGCO_SANDBOX_BUSINESS_ID;
        }
        return METERINGCO_PRODUCTION_BUSINESS_ID;
    }

    static tenantBusinessIdFromMetadata(metadata?: string): string | undefined {
        if (!metadata) {
            return undefined;
        }
        try {
            const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            return parsed?.businessID;
        } catch (e) {
            return undefined;
        }
    }

    static buildCallMetadata(extra?: Record<string, string>): Record<string, string> {
        return {
            uuid: extra?.uuid || randomUUID(),
            ...(extra || {}),
        };
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
}
