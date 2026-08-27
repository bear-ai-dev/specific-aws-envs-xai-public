import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TokenConsumerService } from '../token-consumer/token-consumer.service';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { EnvironmentService } from '../users/users.service';
import { InfluxService } from '../influx/influx.service';
import { TokenType } from '../token-consumer/dto/TokenType';

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
                            // Fire-and-forget: recording must not add a round trip to the request it describes.
                            TokenConsumerService.getMeteringCoCustomerId(
                                businessID,
                                subject,
                                this.environmentService,
                            )
                                .then((dogfoodCustomerDataRes) => {
                                    if (dogfoodCustomerDataRes) {
                                        TokenRegisterInterceptor.logger.debug(
                                            `TokenRegisterInterceptor: dogfoodCustomerDataRes: ${dogfoodCustomerDataRes?.meteringcoCustomerId} ${dogfoodCustomerDataRes?.saasCustomerAssociatedBusinessID}`,
                                        );
                                        return TokenConsumerService.recordCall({
                                            influxService: this.influxService,
                                            meteringcoCustomerId: dogfoodCustomerDataRes.meteringcoCustomerId,
                                            saasCustomerAssociatedBusinessID:
                                                dogfoodCustomerDataRes.saasCustomerAssociatedBusinessID,
                                            saasCustomerBusinessID: businessID,
                                            amount: 1,
                                            moment: new Date().toISOString(),
                                            metadata: {
                                                tokenType: TokenType.apiCall,
                                                path: req?.route?.path || req?.url,
                                                method: req?.method,
                                            },
                                        });
                                    }
                                })
                                .catch((e) => {
                                    TokenRegisterInterceptor.logger.error('Failed to register API call', e);
                                });
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
