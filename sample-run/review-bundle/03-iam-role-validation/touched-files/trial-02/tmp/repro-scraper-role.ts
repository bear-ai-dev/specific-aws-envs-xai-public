import { proveScraperRoleCanCollect } from '../app/src/utils/aws/sts.js';

async function expectReject(label: string, fn: () => Promise<unknown>) {
    try {
        await fn();
        console.log('FAIL expected reject:', label);
        process.exitCode = 1;
    } catch (e: any) {
        console.log('OK rejected', label, e?.message || e);
    }
}

async function expectOk(label: string, fn: () => Promise<unknown>) {
    try {
        await fn();
        console.log('OK accepted', label);
    } catch (e: any) {
        console.log('FAIL expected ok:', label, e?.message || e);
        process.exitCode = 1;
    }
}

(async () => {
    await expectOk('usage-scraper with matching external id', () =>
        proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'nw-7f31c2'),
    );
    await expectReject('usage-scraper with wrong external id', () =>
        proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'wrong-id'),
    );
    await expectOk('open-scraper with no external id', () =>
        proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/meteringco-open-scraper'),
    );
    await expectReject('reports-reader can assume but cannot describe instances', () =>
        proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/meteringco-reports-reader', 'nw-a01b'),
    );
    await expectReject('bare role can assume but cannot describe instances', () =>
        proveScraperRoleCanCollect('arn:aws:iam::300000000022:role/meteringco-bare-role'),
    );
    await expectReject('deployment-pipeline does not trust platform', () =>
        proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/deployment-pipeline'),
    );
    await expectOk('staging scraper with matching external id', () =>
        proveScraperRoleCanCollect('arn:aws:iam::300000000022:role/meteringco-staging-scraper', 'nw-stg-4410'),
    );
})();
