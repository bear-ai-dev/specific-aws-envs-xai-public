import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TokenConsumerService } from '../token-consumer/token-consumer.service';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { EnvironmentService } from '../users/users.service';
import { InfluxService } from '../influx/influx.service';
import { randomUUID } from 'crypto';

@Injectable()
export class TokenRegisterInterceptor implements NestInterceptor {
    static logger = new Logger(TokenRegisterInterceptor.name);
    environmentService: EnvironmentService;
    tokenConsumerService: TokenConsumerService;
    constructor() {
        const influxService = new InfluxService();
        this.environmentService = new EnvironmentService(influxService);
        this.tokenConsumerService = new TokenConsumerService(undefined, undefined, this.environmentService, influxService);
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
                            const dogfoodCustomerDataRes = await TokenConsumerService.getMeteringCoCustomerId(
                                businessID,
                                subject,
                                this.environmentService,
                            );
                            if (dogfoodCustomerDataRes) {
                                TokenRegisterInterceptor.logger.debug(
                                    `TokenRegisterInterceptor: dogfoodCustomerDataRes: ${dogfoodCustomerDataRes?.meteringcoCustomerId} ${dogfoodCustomerDataRes?.saasCustomerAssociatedBusinessID}`,
                                );
                                await this.tokenConsumerService.registerApiCall({
                                    businessID,
                                    subject,
                                    amount: 0.001,
                                    moment: new Date(),
                                    metadata: TokenConsumerService.buildCallMetadata({ uuid: randomUUID() }),
                                    meteringcoCustomerId: dogfoodCustomerDataRes.meteringcoCustomerId,
                                    saasCustomerAssociatedBusinessID:
                                        dogfoodCustomerDataRes.saasCustomerAssociatedBusinessID,
                                    meteringcoCustomer: dogfoodCustomerDataRes.meteringcoCustomer,
                                });
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
