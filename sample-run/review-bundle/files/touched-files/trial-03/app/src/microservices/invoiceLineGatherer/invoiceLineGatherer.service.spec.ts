import { InvoiceLineGathererService } from './invoiceLineGatherer.service.js';

describe('InvoiceLineGathererService', () => {
    const service = new InvoiceLineGathererService();

    test('charges only permitted overage and respects free-dimension settings for sandbox catalogues', async () => {
        const ridge = await service.gatherInvoiceLines({
            businessID: 'biz-ridge',
            catalogueBucket: 'meteringco-billing-sandbox',
            catalogueKey: 'catalogues/biz-ridge-2026-07.json',
        });
        const alpha = ridge.find((row) => row.customerId === 'cus_sample_alpha');
        const bravo = ridge.find((row) => row.customerId === 'cus_sample_bravo');
        expect(alpha.lineItems).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Ridge API Calls - Ridge Plan', quantity: 100, unitCost: 0.01 }),
                expect.objectContaining({ name: 'Ridge Seats - Ridge Plan', quantity: 2, unitCost: 10 }),
            ]),
        );
        expect(alpha.lineItems).toHaveLength(2);
        expect(alpha.lineItems.find((item) => item.name.includes('Alerts'))).toBeUndefined();
        expect(alpha.lineItems.find((item) => item.name.includes('Reports'))).toBeUndefined();
        expect(alpha.lineItems.find((item) => item.name.includes('Storage'))).toBeUndefined();

        expect(bravo.lineItems).toEqual([
            expect.objectContaining({ name: 'Ridge Jobs - Ridge Metered', quantity: 200, unitCost: 0.05 }),
        ]);

        const vale = await service.gatherInvoiceLines({
            businessID: 'biz-vale',
            catalogueBucket: 'meteringco-billing-sandbox',
            catalogueKey: 'catalogues/biz-vale-2026-07.json',
        });
        const charlie = vale.find((row) => row.customerId === 'cus_sample_charlie');
        expect(charlie.lineItems).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Vale Messages - Vale Plan', quantity: 50, unitCost: 0.01 }),
                expect.objectContaining({ name: 'Vale Hours - Vale Plan', quantity: 10, unitCost: 0 }),
                expect.objectContaining({ name: 'Vale Units - Vale Plan', quantity: 5, unitCost: 5 }),
            ]),
        );
        expect(charlie.lineItems).toHaveLength(3);
    });
});
