import { InvoiceLineGathererService } from './invoiceLineGatherer.service.js';

describe('InvoiceLineGathererService', () => {
    const service = new InvoiceLineGathererService();

    test('charges only permitted overage and hides free dimensions when settings ask', async () => {
        const assembled = await service.gatherInvoiceLines({
            businessID: 'biz-ridge',
            catalogueBucket: 'meteringco-billing-sandbox',
            catalogueKey: 'catalogues/biz-ridge-2026-07.json',
        });

        expect(assembled).toHaveLength(2);

        const alpha = assembled.find((row) => row.customerId === 'cus_sample_alpha');
        expect(alpha.offeringId).toBe('off-ridge-plan');
        expect(alpha.lineItems).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Ridge API Calls - Ridge Plan', quantity: 100, unitCost: 0.01 }),
                expect.objectContaining({ name: 'Ridge Seats - Ridge Plan', quantity: 2, unitCost: 10 }),
            ]),
        );
        expect(alpha.lineItems.find((item) => item.name.includes('Ridge Alerts'))).toBeUndefined();
        expect(alpha.lineItems.find((item) => item.name.includes('Ridge Reports'))).toBeUndefined();
        expect(alpha.lineItems.find((item) => item.name.includes('Ridge Storage'))).toBeUndefined();

        const bravo = assembled.find((row) => row.customerId === 'cus_sample_bravo');
        expect(bravo.offeringId).toBe('off-ridge-usage');
        expect(bravo.lineItems).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Ridge Jobs - Ridge Metered', quantity: 200, unitCost: 0.05 }),
            ]),
        );
        expect(bravo.lineItems.find((item) => item.name.includes('Ridge Minutes'))).toBeUndefined();
        expect(bravo.lineItems.find((item) => item.name.includes('Ridge Scans'))).toBeUndefined();
        expect(bravo.lineItems.find((item) => item.name.includes('Ridge Tasks'))).toBeUndefined();
    });

    test('shows zero-priced dimensions when invoice settings leave them visible', async () => {
        const assembled = await service.gatherInvoiceLines({
            businessID: 'biz-vale',
            catalogueBucket: 'meteringco-billing-sandbox',
            catalogueKey: 'catalogues/biz-vale-2026-07.json',
        });

        expect(assembled).toHaveLength(1);
        const charlie = assembled[0];
        expect(charlie.customerId).toBe('cus_sample_charlie');
        expect(charlie.lineItems).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'Vale Messages - Vale Plan', quantity: 50, unitCost: 0.01 }),
                expect.objectContaining({ name: 'Vale Hours - Vale Plan', quantity: 10, unitCost: 0 }),
                expect.objectContaining({ name: 'Vale Units - Vale Plan', quantity: 5, unitCost: 5 }),
            ]),
        );
    });
});
