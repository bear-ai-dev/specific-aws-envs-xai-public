const Module = require('module');
const path = require('path');
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('.') && request.endsWith('.js') && parent && parent.filename && parent.filename.endsWith('.ts')) {
        const withoutJs = request.slice(0, -3);
        try {
            return orig.call(this, withoutJs, parent, isMain, options);
        } catch (e) {
            try {
                return orig.call(this, withoutJs + '.ts', parent, isMain, options);
            } catch (e2) {
                // fall through
            }
        }
    }
    return orig.call(this, request, parent, isMain, options);
};

require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs',
        esModuleInterop: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        allowJs: true,
        skipLibCheck: true,
    },
    skipProject: true,
});

const { InvoiceLineGathererService } = require('./src/microservices/invoiceLineGatherer/invoiceLineGatherer.service.ts');

(async () => {
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
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
