import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TokenConsumerService } from '../token-consumer/token-consumer.service';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { EnvironmentService } from '../users/users.service';
import { InfluxService } from '../influx/influx.service';
import { TokenType } from '../token-consumer/dto/TokenType';
const FIVE_MINUTES_IN_MS = 300000;

@Injectable()
export class TokenRegisterInterceptor implements NestInterceptor {
    static logger = new Logger(TokenRegisterInterceptor.name);
    environmentService: EnvironmentService;
    constructor() {
        this.environmentService = new EnvironmentService(new InfluxService());
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
                            const tokenConsumerService = new TokenConsumerService(
                                undefined,
                                undefined,
                                this.environmentService,
                                new InfluxService(),
                                undefined,
                            );
                            // Do not await: recording a call must not add a round trip to the request.
                            tokenConsumerService
                                .registerCall({
                                    businessID,
                                    subject,
                                    tokenAmount: '1',
                                    metadata: {
                                        tokenType: TokenType.apiCall,
                                        path: req?.path,
                                        method: req?.method,
                                    },
                                    timestamp: new Date().toISOString(),
                                })
                                .catch((err) => {
                                    TokenRegisterInterceptor.logger.error('Failed to register API call', err);
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
