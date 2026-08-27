import { Injectable } from '@nestjs/common';
import { AuditScope, AuditProcessor, AuditPublishRequest } from './entities/audit.interface';
import { AuditEntity, ErrorAuditProcessor } from './entities/audit.entity';

@Injectable()
export class AuditService {
    private static auditSystem = new AuditEntity();

    public subscribeForAuditEvents() {
        AuditService.auditSystem.subscribe(AuditScope.ERROR, new ErrorAuditProcessor());
    }

    public static publishEvent(auditPublishRequest: AuditPublishRequest) {
        AuditService.auditSystem.publish(auditPublishRequest);
    }
}
