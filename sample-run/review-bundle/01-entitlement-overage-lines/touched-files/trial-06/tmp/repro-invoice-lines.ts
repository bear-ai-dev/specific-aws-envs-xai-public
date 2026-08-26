import { InvoiceLineGathererService } from '/app/src/microservices/invoiceLineGatherer/invoiceLineGatherer.service.ts';

async function run() {
    const svc = new InvoiceLineGathererService();
    const ridge = await svc.gatherInvoiceLines({
        businessID: 'biz-ridge',
        catalogueBucket: 'meteringco-billing-sandbox',
        catalogueKey: 'catalogues/biz-ridge-2026-07.json',
    });
    const vale = await svc.gatherInvoiceLines({
        businessID: 'biz-vale',
        catalogueBucket: 'meteringco-billing-sandbox',
        catalogueKey: 'catalogues/biz-vale-2026-07.json',
    });
    console.log(JSON.stringify({ ridge, vale }, null, 2));
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
