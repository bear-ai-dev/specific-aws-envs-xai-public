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
import { CustomerEntity, ReadCustomerResponseData } from '../customer/entities/customer.entity';
import { LocalJWTAuthService } from '../authz/jwt-local.strategy';
import { EnvironmentService } from '../users/users.service';
import { InfluxService } from '../influx/influx.service';
import { TokenConsumer } from './entities/token-consumer.entity';
import { TokenType } from './dto/TokenType';
import { DatetimeUtils } from '../utils/datetime';
import { UsageEntity } from '../usage/entities/usage.entity';
import { MeasurementFormat } from '../measurement-config/entities/measurement.interface';

export const METERINGCO_PRODUCTION_BUSINESS_ID = 'meteringco-production';
export const METERINGCO_SANDBOX_BUSINESS_ID = 'meteringco-sandbox';

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

    async registerCall({
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
        return TokenConsumerService.registerCall({
            businessID,
            subject,
            amount,
            timestamp,
            metadata,
            environmentService: this.environmentSerivce,
            influxService: this.influxService,
        });
    }

    /**
     * Register a single API call against the platform's own customer for that tenant
     * in the aggregate bucket. Must not flush — recording one must not add a round trip
     * to the request it describes. The call is recorded at its own moment so late /
     * unordered / duplicate arrivals stay in the period they happened in.
     */
    public static async registerCall({
        businessID,
        subject,
        amount = '1',
        timestamp,
        metadata,
        environmentService,
        influxService,
    }: {
        businessID: string;
        subject?: string;
        amount?: string;
        timestamp?: string;
        metadata?: Record<string, string>;
        environmentService?: EnvironmentService;
        influxService: InfluxService;
    }): Promise<void> {
        if (!businessID || !influxService) {
            return;
        }
        const res = await TokenConsumerService.getMeteringCoCustomerId(businessID, subject, environmentService);
        if (!res) {
            return;
        }
        const { meteringcoCustomerId, saasCustomerAssociatedBusinessID } = res;
        const token = new MeteringCoToken({
            businessID,
            subject,
            tokenAmount: amount,
            timestamp,
            metadata: {
                tokenType: TokenType.apiCall,
                ...(metadata || {}),
            },
        });
        const tokenConsumer = new TokenConsumer(token, meteringcoCustomerId, saasCustomerAssociatedBusinessID);
        const points = TokenConsumer.transformer(tokenConsumer, influxService);
        // flush = false: do not add a round trip to the request this call describes
        await influxService.loadPoints(
            TokenConsumerAsyncProcessor.tokenAggregateBucket,
            process.env.INFLUX_ORG,
            points,
            false,
        );
    }

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
                await this.billTokenAsUsage({
                    token,
                    meteringcoCustomerId,
                    saasCustomerAssociatedBusinessID,
                    meteringcoCustomer,
                });
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
     * Turn a token into billable usage against the platform's own account —
     * the production account and its dimension when the platform customer belongs
     * to production, the sandbox pair otherwise.
     */
    private async billTokenAsUsage({
        token,
        meteringcoCustomerId,
        saasCustomerAssociatedBusinessID,
        meteringcoCustomer,
    }: {
        token: MeteringCoToken;
        meteringcoCustomerId: string;
        saasCustomerAssociatedBusinessID: string;
        meteringcoCustomer: ReadCustomerResponseData;
    }): Promise<void> {
        const isProduction = saasCustomerAssociatedBusinessID === METERINGCO_PRODUCTION_BUSINESS_ID;
        const platformBusinessID = isProduction ? METERINGCO_PRODUCTION_BUSINESS_ID : METERINGCO_SANDBOX_BUSINESS_ID;
        const dimensionId = TokenConsumerService.resolveDimensionId({
            isProduction,
            tokenType: token?.metadata?.tokenType,
            meteringcoCustomer,
        });
        const usagePoint = MeasurementFormat.getPointForm(
            {
                businessID: platformBusinessID,
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
            `${process.env.STAGE}-usage-data`,
            process.env.INFLUX_ORG,
            [usagePoint],
            true,
        );
    }

    private static resolveDimensionId({
        isProduction,
        tokenType,
        meteringcoCustomer,
    }: {
        isProduction: boolean;
        tokenType?: TokenType | string;
        meteringcoCustomer?: ReadCustomerResponseData;
    }): string {
        const offering = meteringcoCustomer?.offering;
        const dimensions = Array.isArray(offering)
            ? offering.flatMap((off) => off?.dimensions || [])
            : offering?.dimensions || [];
        if (tokenType && dimensions.length) {
            const match = dimensions.find((dimension) => {
                const meta = dimension?.metadata || {};
                return (
                    String(meta.tokenType) === String(tokenType) ||
                    String(meta.entitlementType) === String(tokenType) ||
                    (dimension?.dimensionName &&
                        String(dimension.dimensionName).toLowerCase().includes(String(tokenType).toLowerCase()))
                );
            });
            if (match?.dimensionId) {
                return match.dimensionId;
            }
        }
        if (dimensions[0]?.dimensionId) {
            return dimensions[0].dimensionId;
        }
        if (isProduction) {
            return process.env.METERINGCO_PRODUCTION_DIMENSION_ID || '';
        }
        return process.env.METERINGCO_SANDBOX_DIMENSION_ID || '';
    }

    /**
     * Close a period: total one platform customer's registered traffic across a window
     * and turn that total into a single billable token against the platform's own account.
     * Given no window, closes the six hours behind now. A closed period is not re-opened
     * for late arrivals — those are still recorded at their own moment via registerCall.
     */
    @Cron('0 */6 * * *')
    async scheduledClosePeriod(): Promise<void> {
        TokenConsumerService.logger.debug('Running scheduled six-hour token close');
        await this.closePeriod();
    }

    async closePeriod({
        customerId,
        startDate,
        endDate,
        businessID,
        subject,
    }: {
        customerId?: string;
        startDate?: string | Date;
        endDate?: string | Date;
        businessID?: string;
        subject?: string;
    } = {}): Promise<BasicResponseDTO | void> {
        try {
            const end = endDate ? new Date(endDate) : new Date();
            const start = startDate ? new Date(startDate) : DatetimeUtils.sixHoursAgo(end);

            if (!customerId && !businessID) {
                const customers = await InfluxService.getMeteringCoCustomers();
                await Promise.all(
                    (customers || []).map(async (row) => {
                        try {
                            const entity = CustomerEntity.dbModelToEntity(row);
                            let tenantBusinessID = businessID;
                            if (row?.metadata) {
                                try {
                                    const parsed = JSON.parse(row.metadata);
                                    if (parsed?.businessID) {
                                        tenantBusinessID = parsed.businessID;
                                    }
                                } catch (e) {
                                    TokenConsumerService.logger.warn(
                                        `Failed to parse metadata for customer ${entity.customerId}`,
                                    );
                                }
                            }
                            await this.closePeriodForCustomer({
                                customerId: entity.customerId,
                                businessID: tenantBusinessID,
                                subject,
                                start,
                                end,
                            });
                        } catch (e) {
                            TokenConsumerService.logger.error(
                                'Failed to close period for a customer',
                                serializeError(e),
                            );
                        }
                    }),
                );
                return { message: `Closed period ${start.toISOString()} - ${end.toISOString()} for all customers` };
            }

            return this.closePeriodForCustomer({ customerId, businessID, subject, start, end });
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close period',
                data: [serializeError(e)],
            });
        }
    }

    private async closePeriodForCustomer({
        customerId,
        businessID,
        subject,
        start,
        end,
    }: {
        customerId?: string;
        businessID?: string;
        subject?: string;
        start: Date;
        end: Date;
    }): Promise<BasicResponseDTO | void> {
        let resolvedCustomerId = customerId;
        let tenantBusinessID = businessID;

        if (!resolvedCustomerId && tenantBusinessID) {
            const res = await TokenConsumerService.getMeteringCoCustomerId(
                tenantBusinessID,
                subject,
                this.environmentSerivce,
            );
            if (res) {
                resolvedCustomerId = res.meteringcoCustomerId;
            }
        }

        if (!resolvedCustomerId) {
            TokenConsumerService.logger.error('No customer found to close period for');
            return { message: 'No customer found to close period for' };
        }

        TokenConsumerService.logger.debug(
            `Closing period for customerId: ${resolvedCustomerId} from ${start.toISOString()} to ${end.toISOString()}`,
        );

        const aggregateRows = await this.influxService.aggregateMeteringCoToken({
            customerId: resolvedCustomerId,
            startDate: start,
            endDate: end,
        });

        const total = (aggregateRows || []).reduce((acc, row) => {
            const value = typeof row?._value === 'number' ? row._value : parseFloat(String(row?._value ?? 0));
            return acc + (Number.isFinite(value) ? value : 0);
        }, 0);

        TokenConsumerService.logger.debug(`Aggregated token total for customerId: ${resolvedCustomerId} is ${total}`);

        if (!tenantBusinessID) {
            TokenConsumerService.logger.warn(
                `No tenant businessID provided when closing period for customerId: ${resolvedCustomerId}`,
            );
        }

        // The total becomes a single token for that period; create turns it into billable usage.
        // Closed periods are not re-opened — this is a new token, not a rewrite of prior invoices.
        if (tenantBusinessID) {
            await this.create({
                businessID: tenantBusinessID,
                subject,
                tokenAmount: String(total),
                timestamp: end.toISOString(),
                metadata: {
                    tokenType: TokenType.apiCall,
                    managed: 'true',
                    periodStart: start.toISOString(),
                    periodEnd: end.toISOString(),
                    sourceCustomerId: resolvedCustomerId,
                },
            });
        }

        return {
            message: `Closed period for customerId: ${resolvedCustomerId} total: ${total}`,
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
