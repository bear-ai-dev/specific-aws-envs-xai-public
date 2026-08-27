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
import { Environment } from '../users/dto/Environment';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';
import { UsageEntity } from '../usage/entities/usage.entity';

const METERINGCO_PRODUCTION_BUSINESS_ID = 'meteringco-production';
const METERINGCO_SANDBOX_BUSINESS_ID = 'meteringco-sandbox';
const METERINGCO_PRODUCTION_DIMENSION_ID = process.env.METERINGCO_PRODUCTION_DIMENSION_ID || '';
const METERINGCO_SANDBOX_DIMENSION_ID = process.env.METERINGCO_SANDBOX_DIMENSION_ID || '';

function snapToSixHourWindow(end: Date): { start: Date; end: Date } {
    const endMs = end.getTime();
    const sixHours = 6 * 60 * 60 * 1000;
    const windowEndMs = Math.floor(endMs / sixHours) * sixHours;
    const windowStartMs = windowEndMs - sixHours;
    // If the caller supplied an explicit end that already lands on a boundary,
    // use the six hours immediately behind that boundary.
    return { start: new Date(windowStartMs), end: new Date(windowEndMs) };
}

@Injectable()
export class TokenConsumerService {
    public static cacheKey = (businessID) => `${businessID}-tokenConsumer`;
    public static closedPeriodCacheKey = (customerId: string, start: string, end: string) =>
        `token-period-closed-${customerId}-${start}-${end}`;
    public static logger = new Logger(TokenConsumerService.name);
    constructor(
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => LocalJWTAuthService)) readonly localJWTAuthService: LocalJWTAuthService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentSerivce: EnvironmentService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
    ) {}

    /**
     * Record a platform API call against the tenant's MeteringCo customer in the
     * aggregate bucket. Must not flush — recording one must not add a round trip.
     */
    static async registerCall({
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
        metadata?: MeteringCoToken['metadata'];
        environmentService?: EnvironmentService;
        influxService: InfluxService;
    }): Promise<void> {
        if (!businessID || !influxService) {
            return;
        }
        try {
            const token = new MeteringCoToken({
                businessID,
                subject,
                tokenAmount,
                timestamp,
                metadata: metadata || { tokenType: TokenType.apiCall },
            });
            const res = await TokenConsumerService.getMeteringCoCustomerId(businessID, subject, environmentService);
            if (!res) {
                return;
            }
            const { meteringcoCustomerId, saasCustomerAssociatedBusinessID } = res;
            const entity = new TokenConsumer(token, meteringcoCustomerId, saasCustomerAssociatedBusinessID);
            const points = TokenConsumer.transformer(entity, influxService);
            // flush=false: do not add a round trip to the request this call describes
            await influxService.loadPoints(
                TokenConsumerAsyncProcessor.tokenAggregateBucket,
                process.env.INFLUX_ORG,
                points,
                false,
            );
        } catch (e) {
            TokenConsumerService.logger.error('Failed to register API call token', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to register API call token',
                data: [serializeError(e)],
            });
        }
    }

    async registerCall(args: {
        businessID: string;
        subject?: string;
        tokenAmount?: string;
        timestamp?: string;
        metadata?: MeteringCoToken['metadata'];
    }): Promise<void> {
        await TokenConsumerService.registerCall({
            ...args,
            environmentService: this.environmentSerivce,
            influxService: this.influxService,
        });
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
                const { businessID: platformBusinessID, dimensionId } = TokenConsumerService.resolvePlatformAccount(
                    meteringcoCustomer,
                    token.metadata?.tokenType,
                );
                if (platformBusinessID && dimensionId) {
                    const entity = new StandardMeasurementEntity({
                        businessID: platformBusinessID,
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
                        `No platform account/dimension resolved for businessID: ${meteringcoToken?.businessID}, customer: ${meteringcoCustomerId}`,
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
     * Close a period. Given a window, total one platform customer's registered
     * traffic across that window; given none, close the six hours behind now.
     * A scheduled job runs this every six hours.
     */
    @Cron(SupportedMeasurementFrequencies.everySixHours)
    async closePeriod({
        customerId,
        businessID,
        subject,
        startDate,
        endDate,
    }: {
        customerId?: string;
        businessID?: string;
        subject?: string;
        startDate?: string | Date;
        endDate?: string | Date;
    } = {}): Promise<BasicResponseDTO | void> {
        try {
            let windowEnd = endDate ? new Date(endDate) : undefined;
            let windowStart = startDate ? new Date(startDate) : undefined;
            if (!windowStart || !windowEnd) {
                const snapped = snapToSixHourWindow(windowEnd || new Date());
                windowStart = windowStart || snapped.start;
                windowEnd = windowEnd || snapped.end;
            }
            TokenConsumerService.logger.debug(
                `Closing token period start: ${windowStart.toISOString()} end: ${windowEnd.toISOString()} customerId: ${customerId} businessID: ${businessID}`,
            );

            const customers: Array<{
                meteringcoCustomerId: string;
                saasCustomerAssociatedBusinessID: string;
                meteringcoCustomer: ReadCustomerResponseData;
            }> = [];

            if (businessID) {
                const resolved = await TokenConsumerService.getMeteringCoCustomerId(
                    businessID,
                    subject,
                    this.environmentSerivce,
                );
                if (resolved) {
                    customers.push(resolved);
                }
            } else if (customerId) {
                const listed = await this.listPlatformCustomers();
                const match = listed.find((customer) => customer.customerId === customerId);
                if (match) {
                    customers.push({
                        meteringcoCustomerId: match.customerId,
                        saasCustomerAssociatedBusinessID: match.businessID,
                        meteringcoCustomer: match,
                    });
                }
            } else {
                const listed = await this.listPlatformCustomers();
                listed.forEach((customer) => {
                    if (customer?.customerId) {
                        customers.push({
                            meteringcoCustomerId: customer.customerId,
                            saasCustomerAssociatedBusinessID: customer.businessID,
                            meteringcoCustomer: customer,
                        });
                    }
                });
            }

            await Promise.all(
                customers.map((customer) =>
                    this.billPeriod({
                        customerId: customer.meteringcoCustomerId,
                        meteringcoCustomer: customer.meteringcoCustomer,
                        startDate: windowStart,
                        endDate: windowEnd,
                    }),
                ),
            );
            return { message: 'Token period closed' };
        } catch (e) {
            TokenConsumerService.logger.error('Failed to close token period', serializeError(e));
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Failed to close token period',
                data: [serializeError(e)],
            });
        }
    }

    private async billPeriod({
        customerId,
        meteringcoCustomer,
        startDate,
        endDate,
    }: {
        customerId: string;
        meteringcoCustomer: ReadCustomerResponseData;
        startDate: Date;
        endDate: Date;
    }): Promise<void> {
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        const closedKey = TokenConsumerService.closedPeriodCacheKey(customerId, startIso, endIso);
        const alreadyClosed = await cacheManager.get(closedKey);
        if (alreadyClosed) {
            TokenConsumerService.logger.debug(
                `Period already closed for customer ${customerId} ${startIso} - ${endIso}; not re-opening`,
            );
            return;
        }

        const rows = await this.influxService.aggregateMeteringCoToken({
            customerId,
            startDate,
            endDate,
        });
        const total = (rows || []).reduce((acc, row) => {
            const value = typeof row?._value === 'number' ? row._value : parseFloat(`${row?._value ?? 0}`);
            return acc + (Number.isFinite(value) ? value : 0);
        }, 0);
        TokenConsumerService.logger.debug(
            `Aggregated token total ${total} for customer ${customerId} between ${startIso} and ${endIso}`,
        );

        await cacheManager.set(closedKey, '1');

        if (!total) {
            return;
        }

        // create() expects the tenant businessID so it can resolve the platform customer,
        // then writes billable usage against the production/sandbox platform account.
        const tenantBusinessID =
            (typeof meteringcoCustomer?.metadata === 'object' &&
                meteringcoCustomer?.metadata &&
                (meteringcoCustomer.metadata as any).businessID) ||
            undefined;
        await this.create({
            businessID: tenantBusinessID || meteringcoCustomer?.businessID || METERINGCO_PRODUCTION_BUSINESS_ID,
            tokenAmount: total.toString(),
            timestamp: endIso,
            metadata: {
                tokenType: TokenType.apiCall,
                startDate: startIso,
                endDate: endIso,
            },
        });
    }

    public static resolvePlatformAccount(
        customer: ReadCustomerResponseData,
        tokenType?: string,
    ): { businessID: string; dimensionId?: string } {
        const customerBusinessID = customer?.businessID || '';
        const belongsToProduction =
            customerBusinessID === METERINGCO_PRODUCTION_BUSINESS_ID ||
            customerBusinessID?.includes(Environment.PRODUCTION);
        const businessID = belongsToProduction
            ? METERINGCO_PRODUCTION_BUSINESS_ID
            : METERINGCO_SANDBOX_BUSINESS_ID;
        const dimensionId =
            TokenConsumerService.resolveDimensionId(customer, tokenType) ||
            (belongsToProduction
                ? METERINGCO_PRODUCTION_DIMENSION_ID
                : METERINGCO_SANDBOX_DIMENSION_ID);
        return { businessID, dimensionId };
    }

    public static resolveDimensionId(customer: ReadCustomerResponseData, tokenType?: string): string | undefined {
        const offering = customer?.offering;
        if (!offering) {
            return undefined;
        }
        const offerings = Array.isArray(offering) ? offering : [offering];
        const dimensions = offerings.flatMap((off) => off?.dimensions || []);
        if (tokenType) {
            const match = dimensions.find((dimension) => {
                const entitlementType = dimension?.metadata?.entitlementType?.toString();
                const dimensionTokenType = dimension?.metadata?.tokenType?.toString();
                const name = dimension?.dimensionName?.toLowerCase().replace(/[\s_-]/g, '') || '';
                const normalizedType = tokenType.toLowerCase();
                return (
                    entitlementType === tokenType ||
                    dimensionTokenType === tokenType ||
                    name === normalizedType ||
                    name.includes(normalizedType)
                );
            });
            if (match?.dimensionId) {
                return match.dimensionId;
            }
        }
        return dimensions[0]?.dimensionId;
    }

    private async listPlatformCustomers(): Promise<ReadCustomerResponseData[]> {
        const data = await InfluxService.getMeteringCoCustomers();
        if (!data?.length) {
            return [];
        }
        const customers = await Promise.all(
            data.map(async (row) => {
                const entity = CustomerEntity.dbModelToEntity(row);
                let tenantBusinessID: string | undefined;
                if (entity?.metadata && typeof entity.metadata === 'object') {
                    tenantBusinessID = (entity.metadata as any).businessID;
                }
                if (tenantBusinessID) {
                    const { data: full } = await UserEntitlements.queryForMeteringCoCustomer({
                        businessIDs: [tenantBusinessID],
                    });
                    if (full?.length) {
                        return full[0];
                    }
                }
                return entity;
            }),
        );
        return customers.filter(Boolean);
    }
}
