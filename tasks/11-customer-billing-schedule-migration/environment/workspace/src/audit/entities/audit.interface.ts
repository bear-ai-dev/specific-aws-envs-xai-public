export type AuditPublishResponse = {
    message: string;
    id: string;
    data: Array<any>;
};

export enum AuditScope {
    ERROR = 'ERROR',
}

export type AuditPublishRequest = {
    message: string;
    topic: AuditScope;
    data: Array<any>;
};
export interface AuditProcessor {
    process: (auditPublishRequest: AuditPublishRequest) => void;
}

export interface Audit {
    publish: (publishRequest: AuditPublishRequest) => AuditPublishResponse;
    subscribe: (auditLevel: AuditScope, processor: AuditProcessor) => void;
}
