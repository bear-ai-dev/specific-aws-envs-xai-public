import { InvoiceLineGathererService } from './invoiceLineGatherer.service.js';

describe('invoice line gatherer against the local catalogue', () => {
    const svc = new InvoiceLineGathererService();

    test('assembles ridge and vale invoice lines from the billing bucket', async () => {
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
        expect(ridge).toHaveLength(2);
        expect(vale).toHaveLength(1);
    });
});
