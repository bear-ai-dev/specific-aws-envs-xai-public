import { AuditService } from '../../audit/audit.service';
import { AuditScope } from '../../audit/entities/audit.interface';
import { AggregatedUsageResponse } from '../../customer/dto/read-customer.dto';
import { DimensionsService } from '../../dimensions/dimensions.service';
import { ReadDimensionResponseData } from '../../dimensions/dto/read-dimension.dto';
import { InfluxService } from '../../influx/influx.service';
import { InvoiceLineItem } from '../../invoice/entities/invoice.entity';
import { validBillingCycles } from '../../offering/dto/createOffering.dto';

import { ReadServiceResponseData } from '../../services/dto/readService.dto';

export enum billingScheduleConsumers {
    billingReport = 'billingReport',
}

export class Billing {
    public static _measurement = 'billingReport';
    public invoiceId: string;
    public businessID: string;
    public customerId: string;
    public startTime: string;
    public endTime: string;
    public billingId: string;
    constructor({ invoiceId, businessID, customerId, startTime, endTime, billingId }: Billing) {
        this.invoiceId = invoiceId;
        this.businessID = businessID;
        this.customerId = customerId;
        this.startTime = startTime;
        this.endTime = endTime;
        this.billingId = billingId;
    }

    public static async generateLineItemsFromServices({
        data,
        influxService,
        businessID,
    }: {
        data: ReadServiceResponseData[];
        influxService: InfluxService;
        businessID: string;
    }): Promise<InvoiceLineItem[]> {
        const dimensionMap = data.reduce((acc, item): { [key: string]: ReadDimensionResponseData } => {
            const { dimensions } = item.offering;
            dimensions.forEach(({ dimensionId, ...rest }) => {
                acc[dimensionId] = { ...rest, dimensionId, offering: { ...item.offering } };
            });
            return acc;
        }, {});
        // 4. Map dimensions to line items, read the aggregation information for the past billing cycle (group by customerId) from the DB and create a line item
        const lineItems = await Promise.all(
            Object.keys(dimensionMap).map(async (dimensionId) => {
                const {
                    dimensionName,
                    consumptionPrice,
                    consumptionUnit: { unit },
                    offering: { offeringName, billingCycle },
                } = dimensionMap[dimensionId];
                const invoiceName = Billing.invoiceNameGenerator({ dimensionName, offeringName, dimensionUnit: unit });
                const { startTime, endTime } = Billing.billingCycleToTimeRange(billingCycle);
                const totalUsage = await influxService.readAggregateUsage({
                    dimensionId,
                    startTime,
                    endTime,
                    businessID,
                });
                const accumulatedUsage = totalUsage.reduce((acc, { _value }): number => {
                    acc += _value;
                    return acc;
                }, 0);
                return new InvoiceLineItem(invoiceName, accumulatedUsage, consumptionPrice);
            })
        );
        return lineItems;
    }

    public static billingCycleToTimeRange(billingCycle: validBillingCycles): { startTime: string; endTime: string } {
        if (billingCycle === 'monthly') {
            const date = new Date();
            const firstDay = new Date(date.getFullYear(), date.getMonth() - 1, 1);
            const lastDay = new Date(date.getFullYear(), date.getMonth(), 0);
            return { startTime: firstDay.toISOString(), endTime: lastDay.toISOString() };
        }
    }
    private static invoiceNameGenerator({
        offeringName,
        dimensionName,
        dimensionUnit,
    }: {
        offeringName: string;
        dimensionName: string;
        dimensionUnit: string;
    }) {
        return `${dimensionName} (${offeringName}) - ${dimensionUnit}`;
    }

    public static transformer(billingEntity: Billing, influxService: InfluxService) {
        const billingEntityPoint = influxService.getPoint(Billing._measurement);

        billingEntityPoint.stringField('billingId', billingEntity.billingId);
        billingEntityPoint.tag('billingId', billingEntity.billingId);
        billingEntityPoint.tag('invoiceId', billingEntity.invoiceId);
        billingEntityPoint.tag('businessID', billingEntity.businessID);
        billingEntityPoint.tag('customerId', billingEntity.customerId);
        billingEntityPoint.tag('startTime', billingEntity.startTime);
        billingEntityPoint.tag('endTime', billingEntity.endTime);

        return billingEntityPoint;
    }

    public static dbModelToEntity(dbModel) {
        return new Billing({
            invoiceId: dbModel.invoiceId,
            businessID: dbModel.businessID,
            customerId: dbModel.customerId,
            startTime: dbModel.startTime,
            endTime: dbModel.endTime,
            billingId: dbModel.billingId,
        });
    }

    public static usageToTotal(aggregatedUsageResponse: AggregatedUsageResponse): string {
        try {
            const { usage } = aggregatedUsageResponse;

            // TODO take into account discounts and other factors
            const totalUsage = usage.reduce((acc, { value }) => {
                acc += parseFloat(value);
                return acc;
            }, 0);
            return totalUsage.toString();
        } catch (e) {
            AuditService.publishEvent({ message: 'error in usageToTotal', data: [e], topic: AuditScope.ERROR });
        }
    }
}
