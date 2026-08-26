import { InvoiceLineGathererService } from './src/microservices/invoiceLineGatherer/invoiceLineGatherer.service.ts';

const gatherer = new InvoiceLineGathererService();

const pretty = (rows) =>
    rows.map((row) => ({
        customerId: row.customerId,
        offeringId: row.offeringId,
        offeringName: row.offeringName,
        lineItems: row.lineItems,
    }));

const ridge = await gatherer.gatherInvoiceLines({
    businessID: 'biz-ridge',
    catalogueBucket: 'meteringco-billing-sandbox',
    catalogueKey: 'catalogues/biz-ridge-2026-07.json',
});
const vale = await gatherer.gatherInvoiceLines({
    businessID: 'biz-vale',
    catalogueBucket: 'meteringco-billing-sandbox',
    catalogueKey: 'catalogues/biz-vale-2026-07.json',
});

console.log('RIDGE', JSON.stringify(pretty(ridge), null, 2));
console.log('VALE', JSON.stringify(pretty(vale), null, 2));
