import { AccountState } from '../setting/entities/AccountState.js';
import { taxJarApiUrl } from './taxJar.client.js';

describe('taxJarApiUrl', () => {
    const originalSandbox = process.env.TAX_JAR_URL;
    const originalProd = process.env.PROD_TAX_JAR_URL;

    afterEach(() => {
        process.env.TAX_JAR_URL = originalSandbox;
        process.env.PROD_TAX_JAR_URL = originalProd;
    });

    it('uses the sandbox authority for sandbox accounts', () => {
        process.env.TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/sandbox/';
        expect(taxJarApiUrl(AccountState.sandbox)).toEqual('http://127.0.0.1:4566/taxjar/sandbox');
    });

    it('uses the production authority for production accounts', () => {
        process.env.PROD_TAX_JAR_URL = 'http://127.0.0.1:4566/taxjar/production/';
        expect(taxJarApiUrl(AccountState.production)).toEqual('http://127.0.0.1:4566/taxjar/production');
    });
});
