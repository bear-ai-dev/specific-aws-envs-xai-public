import { InvoiceLineGathererService } from './src/microservices/invoiceLineGatherer/invoiceLineGatherer.service.ts';

async function main() {
    const svc = new InvoiceLineGathererService();
    for (const [businessID, catalogueKey] of [
        ['biz-ridge', 'catalogues/biz-ridge-2026-07.json'],
        ['biz-vale', 'catalogues/biz-vale-2026-07.json'],
    ] as const) {
        console.log('==========', businessID, '==========');
        try {
            const result = await svc.gatherInvoiceLines({
                businessID,
                catalogueBucket: 'meteringco-billing-sandbox',
                catalogueKey,
            });
            console.log(JSON.stringify(result, null, 2));
        } catch (err) {
            console.error('FAILED', businessID, err);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
