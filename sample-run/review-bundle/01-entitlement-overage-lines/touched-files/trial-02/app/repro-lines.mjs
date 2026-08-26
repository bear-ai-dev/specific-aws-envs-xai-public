// Reproduce invoice line assembly using the same path as InvoiceLineGathererService
import { getDocument } from './src/utils/aws/s3.ts';
import { getMetricSeries } from './src/utils/aws/cloudwatch.ts';
import { Offering } from './src/offering/entities/offeringPackage.entity.ts';
import { InvoiceLineItems } from './src/invoice/entities/invoice.entity.ts';

async function readUsage({ catalogue, offering, customerId }) {
    const startTime = new Date(catalogue.periodStart);
    const endTime = new Date(catalogue.periodEnd);
    const series = [];
    for (const dimension of offering.dimensions ?? []) {
        const readings = await getMetricSeries({
            namespace: catalogue.usageNamespace,
            metricName: catalogue.usageMetricName,
            dimensions: {
                BusinessId: catalogue.businessID,
                CustomerId: customerId,
                DimensionId: dimension.dimensionId,
            },
            startTime,
            endTime,
            period: catalogue.usagePeriod,
        });
        series.push({
            offeringId: offering.offeringId,
            dimensionId: dimension.dimensionId,
            usage: readings.map(({ timestamp, value }) => ({
                value: value.toString(),
                startTime: timestamp,
                endTime: timestamp,
            })),
        });
    }
    return series;
}

async function gather({ businessID, catalogueBucket, catalogueKey }) {
    const catalogue = await getDocument(catalogueBucket, catalogueKey);
    const startDate = new Date(catalogue.periodStart);
    const endDate = new Date(catalogue.periodEnd);
    const offerings = (catalogue.offerings ?? []).reduce((acc, offering) => {
        acc[offering.offeringId] = offering;
        return acc;
    }, {});
    const assembled = [];
    for (const { customerId, offeringId } of catalogue.enrolments ?? []) {
        const offering = offerings[offeringId];
        const usageOverrides = await readUsage({ catalogue, offering, customerId });
        const offeringInstance = Offering.getInstance(
            offering,
            customerId,
            businessID,
            undefined,
            catalogue.settings,
            undefined,
            undefined,
            undefined,
            usageOverrides,
        );
        const lineItems = new InvoiceLineItems();
        await Offering.getLineItemsForUsage({
            startDate,
            endDate,
            lineItems,
            negative: false,
            businessID,
            customerId,
            customerService: undefined,
            dimensions: offering.dimensions,
            offeringInstance,
        });
        assembled.push({
            customerId,
            offeringId,
            offeringName: offering.offeringName,
            lineItems: lineItems.getLineItems(),
        });
    }
    return assembled;
}

const results = [];
for (const [businessID, catalogueKey] of [
    ['biz-ridge', 'catalogues/biz-ridge-2026-07.json'],
    ['biz-vale', 'catalogues/biz-vale-2026-07.json'],
]) {
    results.push({
        businessID,
        assembled: await gather({
            businessID,
            catalogueBucket: 'meteringco-billing-sandbox',
            catalogueKey,
        }),
    });
}
console.log(JSON.stringify(results, null, 2));
