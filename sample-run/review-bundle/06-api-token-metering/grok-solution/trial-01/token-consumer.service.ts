import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
import { UsageService } from '../usage/usage.service';
import { DatetimeUtils } from '../utils/datetime';
import { MeasurementFormat } from '../measurement-config/entities/measurement.interface';
import { UsageEntity } from '../usage/entities/usage.entity';

@Injectable()
export class TokenConsumerService {
    public static cacheKey = (businessID) => `${businessID}-tokenConsumer`;
    public static logger = new Logger(TokenConsumerService.name);
    public static productionApiCallDimensionId = process.env.METERINGCO_PRODUCTION_API_CALL_DIMENSION_ID;
    public static sandboxApiCallDimensionId = process.env.METERINGCO_SANDBOX_API_CALL_DIMENSION_ID;
    public static billedPeriodCacheKey = (customerId: string, startDate: Date, endDate: Date) =>
        `meteringco-token-billed-${customerId}-${startDate.toISOString()}-${endDate.toISOString()}`;
    constructor(
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => LocalJWTAuthService)) readonly localJWTAuthService: LocalJWTAuthService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentSerivce: EnvironmentService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
        @Inject(forwardRef(() => UsageService)) readonly usageService: UsageService,
    ) {}

    @Cron(SupportedMeasurementFrequencies.everySixHours)
    async scheduledClosePeriod() {
        await this.closePeriod();
    }

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
                    saasCustomerAssociatedBusinessID,
                    token.metadata?.tokenType,
                );
                if (dimensionId && this.influxService) {
                    const usagePoint = MeasurementFormat.getPointForm(
                        {
                            businessID: saasCustomerAssociatedBusinessID,
                            customerId: meteringcoCustomerId,
                            dimensionId,
                            recordValue: parseFloat(token.tokenAmount),
                            timestamp: token.timestamp,
                            metadata: token.metadata,
                            _measurement: UsageEntity._measurement,
                        },
                        this.influxService,
                    );
                    await this.influxService.loadPoints(
                        `${process.env.STAGE || 'prod'}-usage-data`,
                        undefined,
                        [usagePoint],
                        true,
                    );
                }
                if (this.usageService && dimensionId) {
                    await this.usageService.create({
                        businessID: saasCustomerAssociatedBusinessID,
                        customerId: meteringcoCustomerId,
                        dimensionId,
                        recordValue: token.tokenAmount,
                        timestamp: token.timestamp,
                        metadata: token.metadata,
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
    async registerCall({
        businessID,
        subject,
        amount = '1',
        timestamp,
        moment,
        metadata,
    }: {
        businessID: string;
        subject?: string;
        amount?: string | number;
        timestamp?: string;
        moment?: string | Date;
        metadata?: Record<string, string>;
    }): Promise<void> {
        try {
            if (!businessID || TokenConsumerService.isPlatformAccount(businessID)) {
                return;
            }
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                businessID,
                subject,
                this.environmentSerivce,
            );
            if (!res) {
                return;
            }
            const { meteringcoCustomerId, saasCustomerAssociatedBusinessID } = res;
            const recordedAt = timestamp
                ? timestamp
                : moment
                  ? new Date(moment).toISOString()
                  : new Date().toISOString();
            const token = new MeteringCoToken({
                businessID,
                subject,
                tokenAmount: amount?.toString(),
                timestamp: recordedAt,
                metadata: {
                    tokenType: TokenType.apiCall,
                    ...(metadata || {}),
                },
            });
            const entity = new TokenConsumer(token, meteringcoCustomerId, saasCustomerAssociatedBusinessID);
            const point = TokenConsumer.transformer(entity, this.influxService);
            // Recording one must not add a round trip to the request it describes.
            void this.influxService.loadPoints(
                TokenConsumerAsyncProcessor.tokenAggregateBucket,
                undefined,
                [point],
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

    public static isPlatformAccount(businessID: string): boolean {
        return businessID === 'meteringco-production' || businessID === 'meteringco-sandbox';
    }

    public static resolveDimensionId(
        meteringcoCustomer: ReadCustomerResponseData,
        saasCustomerAssociatedBusinessID: string,
        tokenType?: string,
    ): string | undefined {
        const isSandbox =
            saasCustomerAssociatedBusinessID === 'meteringco-sandbox' ||
            /sandbox/i.test(saasCustomerAssociatedBusinessID || '');
        const offering = meteringcoCustomer?.offering;
        const dimensions = Array.isArray(offering)
            ? offering.flatMap((off) => off?.dimensions || [])
            : offering?.dimensions || [];
        const type = (tokenType || TokenType.apiCall).toLowerCase();
        const match = dimensions.find((dimension) => {
            const name = (dimension?.dimensionName || '').toLowerCase();
            return (
                name === type ||
                name.includes(type) ||
                (type === TokenType.apiCall && (name.includes('apicall') || name.includes('api call')))
            );
        });
        if (match?.dimensionId) {
            return match.dimensionId;
        }
        const envDimension = isSandbox
            ? TokenConsumerService.sandboxApiCallDimensionId
            : TokenConsumerService.productionApiCallDimensionId;
        return envDimension || tokenType || TokenType.apiCall;
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
                schedulerID: `${TokenConsumerAsyncProcessor.aggregationProcessor}-${businessID}`,
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

    async closePeriod({
        startDate,
        endDate,
        start,
        end,
        startTime,
        endTime,
        customerId,
    }: {
        startDate?: Date | string;
        endDate?: Date | string;
        start?: Date | string;
        end?: Date | string;
        startTime?: Date | string;
        endTime?: Date | string;
        customerId?: string;
    } = {}): Promise<BasicResponseDTO | void> {
        try {
            const window = TokenConsumerService.resolveWindow(
                startDate || start || startTime,
                endDate || end || endTime,
            );
            TokenConsumerService.logger.debug(
                `Closing token period start: ${window.startDate.toISOString()} end: ${window.endDate.toISOString()}`,
            );
            if (customerId) {
                await this.billPeriod({ customerId, startDate: window.startDate, endDate: window.endDate });
                return { message: `Token period closed for customer: ${customerId}` };
            }
            const customers = await InfluxService.getMeteringCoCustomers();
            const uniqueCustomerIds = Array.from(
                new Set((customers || []).map((customer) => customer?.customerId).filter(Boolean)),
            );
            await Promise.all(
                uniqueCustomerIds.map((id) =>
                    this.billPeriod({ customerId: id, startDate: window.startDate, endDate: window.endDate }),
                ),
            );
            return { message: `Token period closed for ${uniqueCustomerIds.length} customers` };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close token period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close token period',
                data: [serializeError(e)],
            });
        }
    }

    async billPeriod({
        customerId,
        startDate,
        endDate,
    }: {
        customerId: string;
        startDate: Date;
        endDate: Date;
    }): Promise<void> {
        const billedKey = TokenConsumerService.billedPeriodCacheKey(customerId, startDate, endDate);
        const alreadyBilled = await cacheManager.get(billedKey);
        if (alreadyBilled) {
            TokenConsumerService.logger.debug(
                `Skipping already billed token period for customer: ${customerId} ${startDate.toISOString()} ${endDate.toISOString()}`,
            );
            return;
        }
        const rows = await this.influxService.aggregateMeteringCoToken({ customerId, startDate, endDate });
        const total = (rows || []).reduce((acc, row) => acc + Number(row?._value ?? 0), 0);
        await cacheManager.set(billedKey, '1');
        if (!total) {
            TokenConsumerService.logger.debug(`No token traffic to bill for customer: ${customerId}`);
            return;
        }
        const platformAccount = await this.resolvePlatformAccount(customerId);
        if (!platformAccount) {
            TokenConsumerService.logger.error(`Unable to resolve platform account for customer: ${customerId}`);
            return;
        }
        await this.create({
            businessID: platformAccount.tenantBusinessID || platformAccount.saasCustomerAssociatedBusinessID,
            tokenAmount: total.toString(),
            timestamp: endDate.toISOString(),
            metadata: {
                tokenType: TokenType.apiCall,
                managed: 'true',
                periodStart: startDate.toISOString(),
                periodEnd: endDate.toISOString(),
            },
        });
    }

    private async resolvePlatformAccount(customerId: string): Promise<{
        platformBusinessID: string;
        dimensionId: string;
        saasCustomerAssociatedBusinessID: string;
        tenantBusinessID?: string;
    } | void> {
        const customers = await InfluxService.getMeteringCoCustomers();
        const customer = (customers || []).find((row) => row?.customerId === customerId);
        if (!customer) {
            return;
        }
        let tenantBusinessID: string | undefined;
        if (customer.metadata) {
            try {
                const parsed = typeof customer.metadata === 'string' ? JSON.parse(customer.metadata) : customer.metadata;
                tenantBusinessID = parsed?.businessID;
            } catch (e) {
                TokenConsumerService.logger.error('Failed to parse meteringco customer metadata', serializeError(e));
            }
        }
        const platformBusinessID = customer.businessID;
        const isSandbox = platformBusinessID === 'meteringco-sandbox' || /sandbox/i.test(platformBusinessID || '');
        return {
            platformBusinessID,
            saasCustomerAssociatedBusinessID: platformBusinessID,
            tenantBusinessID,
            dimensionId: isSandbox
                ? TokenConsumerService.sandboxApiCallDimensionId
                : TokenConsumerService.productionApiCallDimensionId,
        };
    }

    public static resolveWindow(
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
}
