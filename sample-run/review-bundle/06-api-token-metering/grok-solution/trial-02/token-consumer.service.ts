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
import { UsageService } from '../usage/usage.service';
import { TokenType } from './dto/TokenType';
import { DatetimeUtils } from '../utils/datetime';
import { OnboardingEntity } from '../users/entities/onboarding.entity';

@Injectable()
export class TokenConsumerService {
    public static cacheKey = (businessID) => `${businessID}-tokenConsumer`;
    public static logger = new Logger(TokenConsumerService.name);
    public static closedPeriods = new Set<string>();
    constructor(
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => LocalJWTAuthService)) readonly localJWTAuthService: LocalJWTAuthService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentSerivce: EnvironmentService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
        @Optional() @Inject(forwardRef(() => UsageService)) readonly usageService: UsageService,
    ) {}
    async create(meteringcoToken: MeteringCoToken): Promise<BasicResponseDTO> {
        try {
            TokenConsumerService.logger.debug(
                `Metering Token for businessID: ${meteringcoToken?.businessID}, purpose: ${meteringcoToken?.metadata?.tokenType}`,
            );
            const token = new MeteringCoToken(meteringcoToken);
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                token.businessID,
                token?.subject,
                this.environmentSerivce,
            );
            if (res) {
                const { meteringcoCustomerId, saasCustomerAssociatedBusinessID, meteringcoCustomer } = res;
                TokenConsumerService.logger.debug(`Metering Token for meteringco customerId: ${meteringcoCustomerId}`);
                const { account, dimensionId } = TokenConsumerService.resolvePlatformAccountAndDimension(
                    saasCustomerAssociatedBusinessID,
                    meteringcoCustomer,
                    token.metadata,
                );
                if (account && dimensionId && this.usageService) {
                    await this.usageService.create({
                        businessID: account,
                        customerId: meteringcoCustomerId,
                        dimensionId,
                        recordValue: token.tokenAmount,
                        timestamp: token.timestamp,
                        metadata: token.metadata,
                    });
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

    public static resolvePlatformAccountAndDimension(
        saasCustomerAssociatedBusinessID: string,
        meteringcoCustomer?: ReadCustomerResponseData,
        metadata?: { [key: string]: string },
    ): { account: string; dimensionId: string } {
        const isProduction =
            saasCustomerAssociatedBusinessID === OnboardingEntity.dogfoodBusinessID ||
            saasCustomerAssociatedBusinessID === 'meteringco-production' ||
            (!!saasCustomerAssociatedBusinessID && !saasCustomerAssociatedBusinessID.includes('sandbox'));
        const account = isProduction
            ? process.env.METERINGCO_PRODUCTION_ACCOUNT || saasCustomerAssociatedBusinessID || 'meteringco-production'
            : process.env.METERINGCO_SANDBOX_ACCOUNT || saasCustomerAssociatedBusinessID || 'meteringco-sandbox';
        let dimensionId =
            metadata?.dimensionId ||
            (isProduction
                ? process.env.METERINGCO_PRODUCTION_DIMENSION_ID
                : process.env.METERINGCO_SANDBOX_DIMENSION_ID);
        if (!dimensionId && meteringcoCustomer?.offering) {
            const offering = meteringcoCustomer.offering;
            const dimensions = Array.isArray(offering)
                ? offering.flatMap((o) => o?.dimensions || [])
                : offering?.dimensions || [];
            const apiDim = dimensions.find(
                (d) =>
                    d?.metadata?.tokenType === TokenType.apiCall ||
                    `${d?.dimensionName || ''}`.toLowerCase().includes('api'),
            );
            dimensionId = (apiDim || dimensions[0])?.dimensionId;
        }
        return { account, dimensionId };
    }

    public static async recordCall({
        influxService,
        meteringcoCustomerId,
        saasCustomerAssociatedBusinessID,
        saasCustomerBusinessID,
        amount,
        moment,
        metadata,
    }: {
        influxService: InfluxService;
        meteringcoCustomerId: string;
        saasCustomerAssociatedBusinessID: string;
        saasCustomerBusinessID: string;
        amount: string | number;
        moment?: string | Date;
        metadata?: { [key: string]: string };
    }): Promise<void> {
        const timestamp = moment ? new Date(moment).toISOString() : new Date().toISOString();
        const token = new MeteringCoToken({
            businessID: saasCustomerBusinessID,
            tokenAmount: amount?.toString(),
            timestamp,
            metadata: {
                tokenType: TokenType.apiCall,
                ...(metadata || {}),
            },
        });
        const entity = new TokenConsumer(token, meteringcoCustomerId, saasCustomerAssociatedBusinessID);
        const points = TokenConsumer.transformer(entity, influxService);
        // Buffer only — do not flush, so recording does not add a round trip.
        await influxService.loadPoints(
            TokenConsumerAsyncProcessor.tokenAggregateBucket,
            influxService.org,
            points,
            false,
        );
    }

    async registerCall({
        businessID,
        subject,
        amount,
        moment,
        metadata,
    }: {
        businessID: string;
        subject?: string;
        amount?: string | number;
        moment?: string | Date;
        metadata?: { [key: string]: string };
    }): Promise<void> {
        try {
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                businessID,
                subject,
                this.environmentSerivce,
            );
            if (!res) {
                return;
            }
            const { meteringcoCustomerId, saasCustomerAssociatedBusinessID } = res;
            await TokenConsumerService.recordCall({
                influxService: this.influxService,
                meteringcoCustomerId,
                saasCustomerAssociatedBusinessID,
                saasCustomerBusinessID: businessID,
                amount: amount ?? 1,
                moment,
                metadata,
            });
        } catch (e) {
            TokenConsumerService.logger.error('Failed to register API call', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to register API call',
                data: [serializeError(e)],
            });
        }
    }

    static periodKey(customerId: string, startDate: Date, endDate: Date): string {
        return `closed-period-${customerId}-${new Date(startDate).toISOString()}-${new Date(endDate).toISOString()}`;
    }

    async closePeriod({
        customerId,
        startDate,
        endDate,
        businessID,
        subject,
    }: {
        customerId?: string;
        startDate?: Date | string;
        endDate?: Date | string;
        businessID?: string;
        subject?: string;
    } = {}): Promise<BasicResponseDTO | void> {
        try {
            const windowEnd = endDate ? new Date(endDate) : new Date();
            const windowStart = startDate ? new Date(startDate) : DatetimeUtils.sixHoursAgo(windowEnd);

            let resolvedCustomerId = customerId;
            let resolvedBusinessID = businessID;
            if (!resolvedCustomerId && businessID) {
                const res = await TokenConsumerService.getMeteringCoCustomerId(
                    businessID,
                    subject,
                    this.environmentSerivce,
                );
                if (res) {
                    resolvedCustomerId = res.meteringcoCustomerId;
                    resolvedBusinessID = res.saasCustomerAssociatedBusinessID;
                }
            }
            if (!resolvedCustomerId) {
                TokenConsumerService.logger.error('Cannot close period without a platform customer');
                return;
            }

            // Flush any buffered API-call writes so the window we total is complete.
            try {
                const writeApi = this.influxService.writeApis?.[TokenConsumerAsyncProcessor.tokenAggregateBucket];
                if (writeApi) {
                    await writeApi.flush();
                }
            } catch (e) {
                TokenConsumerService.logger.warn('Failed to flush token aggregate bucket before close', serializeError(e));
            }

            const periodKey = TokenConsumerService.periodKey(resolvedCustomerId, windowStart, windowEnd);
            if (TokenConsumerService.closedPeriods.has(periodKey) || (await cacheManager.get(periodKey))) {
                TokenConsumerService.logger.debug(`Period already closed: ${periodKey}`);
                return { message: `Period already closed for customer: ${resolvedCustomerId}` };
            }

            const rows = await this.influxService.aggregateMeteringCoToken({
                customerId: resolvedCustomerId,
                startDate: windowStart,
                endDate: windowEnd,
            });
            const total = rows?.reduce((sum, row) => sum + (typeof row?._value === 'number' ? row._value : parseFloat(`${row?._value || 0}`)), 0) || 0;

            // Mark closed before billing so a retry cannot reopen the period.
            TokenConsumerService.closedPeriods.add(periodKey);
            await cacheManager.set(periodKey, '1');

            await this.create({
                businessID: resolvedBusinessID || businessID,
                tokenAmount: total.toString(),
                subject,
                timestamp: windowStart.toISOString(),
                metadata: {
                    tokenType: TokenType.apiCall,
                    periodStart: windowStart.toISOString(),
                    periodEnd: windowEnd.toISOString(),
                },
            });
            return { message: `Period closed for customer: ${resolvedCustomerId}` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close period',
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
