import { ReadCustomerResponseData } from '../../customer/entities/customer.entity.js';

export class UsageDocument {
    public value: string;

    public units?: string;

    public usageName?: string;
    public dimensionId?: string;

    public startTime?: string;
    public endTime?: string;

    constructor({ value, units, usageName, dimensionId, startTime, endTime }: UsageDocument) {
        this.value = value;
        this.units = units;
        this.usageName = usageName;
        this.dimensionId = dimensionId;
        this.startTime = startTime;
        this.endTime = endTime;
    }
}

export class ReadUsageForCustomerDto {
    public customerId: string;
    public businessID: string;
    public customer?: ReadCustomerResponseData;
}
