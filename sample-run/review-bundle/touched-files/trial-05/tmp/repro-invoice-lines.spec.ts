import { InvoiceLineGathererService } from './src/microservices/invoiceLineGatherer/invoiceLineGatherer.service';

describe('reproduce metered invoice lines', () => {
    it('assembles lines from the sandbox catalogues', async () => {
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
        console.log('RIDGE', JSON.stringify(ridge, null, 2));
        console.log('VALE', JSON.stringify(vale, null, 2));
    });
});
