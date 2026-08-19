import { InvoiceLineGathererService } from './invoiceLineGatherer.service';

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
        // eslint-disable-next-line no-console
        console.log('RIDGE', JSON.stringify(ridge, null, 2));
        // eslint-disable-next-line no-console
        console.log('VALE', JSON.stringify(vale, null, 2));
        expect(ridge.length).toBeGreaterThan(0);
        expect(vale.length).toBeGreaterThan(0);
    });
});
