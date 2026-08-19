import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Use ts-node ESM loader via dynamic import of compiled-like transpile
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// We'll transpile on the fly with ts-jest/ts-node register
import { InvoiceLineGathererService } from './src/microservices/invoiceLineGatherer/invoiceLineGatherer.service.ts';

const svc = new InvoiceLineGathererService();
for (const [businessID, catalogueKey] of [
    ['biz-ridge', 'catalogues/biz-ridge-2026-07.json'],
    ['biz-vale', 'catalogues/biz-vale-2026-07.json'],
]) {
    console.log('==========', businessID, '==========');
    const result = await svc.gatherInvoiceLines({
        businessID,
        catalogueBucket: 'meteringco-billing-sandbox',
        catalogueKey,
    });
    console.log(JSON.stringify(result, null, 2));
}
