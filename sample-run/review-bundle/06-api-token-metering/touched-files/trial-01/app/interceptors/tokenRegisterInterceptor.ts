import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TokenConsumerService } from '../token-consumer/token-consumer.service';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { EnvironmentService } from '../users/users.service';
import { InfluxService } from '../influx/influx.service';
import { TokenType } from '../token-consumer/dto/TokenType';
import { MeteringCoToken } from '../token-consumer/dto/meteringcoToken.dto';
import { TokenConsumer } from '../token-consumer/entities/token-consumer.entity';
import { TokenConsumerAsyncProcessor } from '../token-consumer/token-consumer-async-processor';
const FIVE_MINUTES_IN_MS = 300000;

@Injectable()
export class TokenRegisterInterceptor implements NestInterceptor {
    static logger = new Logger(TokenRegisterInterceptor.name);
    environmentService: EnvironmentService;
    influxService: InfluxService;
    constructor() {
        this.influxService = new InfluxService();
        this.environmentService = new EnvironmentService(this.influxService);
    }
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        try {
            return next.handle().pipe(
                tap(async () => {
                    try {
                        const req = context.switchToHttp().getRequest();
                        const res = context.switchToHttp().getResponse();
                        TokenConsumerService.logger.debug(`TokenRegisterInterceptor: res: ${res?.statusCode}`);

                        if (res?.statusCode < 400) {
                            const businessID = req?.user?.businessID;
                            const subject = req?.user?.sub;
                            if (!businessID || TokenConsumerService.isPlatformAccount(businessID)) {
                                return;
                            }
                            const dogfoodCustomerDataRes = await TokenConsumerService.getMeteringCoCustomerId(
                                businessID,
                                subject,
                                this.environmentService,
                            );
                            if (dogfoodCustomerDataRes) {
                                TokenRegisterInterceptor.logger.debug(
                                    `TokenRegisterInterceptor: dogfoodCustomerDataRes: ${dogfoodCustomerDataRes?.meteringcoCustomerId} ${dogfoodCustomerDataRes?.saasCustomerAssociatedBusinessID}`,
                                );
                                const token = new MeteringCoToken({
                                    businessID,
                                    subject,
                                    tokenAmount: '1',
                                    timestamp: new Date().toISOString(),
                                    metadata: {
                                        tokenType: TokenType.apiCall,
                                        path: req?.path,
                                        method: req?.method,
                                    },
                                });
                                const entity = new TokenConsumer(
                                    token,
                                    dogfoodCustomerDataRes.meteringcoCustomerId,
                                    dogfoodCustomerDataRes.saasCustomerAssociatedBusinessID,
                                );
                                const point = TokenConsumer.transformer(entity, this.influxService);
                                // Recording one must not add a round trip to the request it describes.
                                void this.influxService.loadPoints(
                                    TokenConsumerAsyncProcessor.tokenAggregateBucket,
                                    undefined,
                                    [point],
                                    false,
                                );
                            }
                        }
                    } catch (e) {
                        TokenRegisterInterceptor.logger.error('Failed to load tokens', e);

                        AuditService.publishEvent({
                            data: [e],
                            topic: AuditScope.ERROR,
                            message: 'Failed to load tokens',
                        });
                    }
                }),
            );
        } catch (e) {
            TokenRegisterInterceptor.logger.error('Failed to load tokens', e);
            return next.handle();
        }
    }
}
