import { Module, OnModuleInit } from '@nestjs/common';
import { AuditService } from './audit.service';

@Module({
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule implements OnModuleInit {
    constructor(private auditService: AuditService) {}
    onModuleInit() {
        this.auditService.subscribeForAuditEvents();
    }
}
