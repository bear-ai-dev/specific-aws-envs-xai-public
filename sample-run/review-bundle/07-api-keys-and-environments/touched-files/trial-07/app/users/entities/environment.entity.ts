import { Point } from '@influxdata/influxdb-client';
import { UserActiveEnvironment } from '../../influx/entities/userTable.entity.js';
import { InfluxService } from '../../influx/influx.service.js';
import { Environment } from '../dto/Environment.js';

export class EnvironmentEntity {
    public static _measurement = 'UserActiveEnvironment';
    public subject: string;
    public environment: Environment;

    constructor({ subject, environment }: { subject: string; environment?: Environment }) {
        this.subject = subject;
        this.environment = environment ? environment : Environment.PRODUCTION;
    }

    static transformer(entity: EnvironmentEntity, influxService: InfluxService): Point[] {
        const environmentPoint = influxService.getPoint(EnvironmentEntity._measurement);
        environmentPoint.tag('subject', entity.subject);
        environmentPoint.stringField('environment', entity.environment);
        return [environmentPoint];
    }

    static dbModelToEntity(dbModel: UserActiveEnvironment) {
        return new EnvironmentEntity({
            subject: dbModel.subject,
            environment: dbModel._value,
        });
    }
}
