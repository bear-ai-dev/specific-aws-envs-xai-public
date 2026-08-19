import { InvoiceLineGathererService } from './src/microservices/invoiceLineGatherer/invoiceLineGatherer.service.ts';

const service = new InvoiceLineGathererService();

const ridge = await service.gatherInvoiceLines({
  businessID: 'biz-ridge',
  catalogueBucket: 'meteringco-billing-sandbox',
  catalogueKey: 'catalogues/biz-ridge-2026-07.json',
});
const vale = await service.gatherInvoiceLines({
  businessID: 'biz-vale',
  catalogueBucket: 'meteringco-billing-sandbox',
  catalogueKey: 'catalogues/biz-vale-2026-07.json',
});

console.log(JSON.stringify({ ridge, vale }, null, 2));
