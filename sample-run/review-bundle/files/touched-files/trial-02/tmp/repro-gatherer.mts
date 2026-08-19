import { InvoiceLineGathererService } from '/app/src/microservices/invoiceLineGatherer/invoiceLineGatherer.service.ts';

const svc = new InvoiceLineGathererService();
const results = [];
for (const [businessID, catalogueKey] of [
    ['biz-ridge', 'catalogues/biz-ridge-2026-07.json'],
    ['biz-vale', 'catalogues/biz-vale-2026-07.json'],
]) {
    const assembled = await svc.gatherInvoiceLines({
        businessID,
        catalogueBucket: 'meteringco-billing-sandbox',
        catalogueKey,
    });
    results.push({ businessID, assembled });
}
console.log(JSON.stringify(results, null, 2));
