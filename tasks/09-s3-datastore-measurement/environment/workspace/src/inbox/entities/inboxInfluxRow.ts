import { BaseInfluxTable } from '../../influx/entities/baseInfluxTable.entity';
import { Inbox } from './inbox.entity';

export class InboxInfluxRow extends BaseInfluxTable {
    public _measurement = Inbox._measurement;
    public _value: string;
    public _field: string;
    public businessID: string;
    public inboxId: string;
    public title: string;
    public description: string;
    public level: string;
    public isArchived: string;
    public messageReceivedDate: string;
}
