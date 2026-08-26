import { assumeRoleAndReadInstanceInventory } from '../app/src/utils/aws/sts.js';

async function check(label: string, fn: () => Promise<unknown>) {
    try {
        await fn();
        console.log('PASS', label);
    } catch (e) {
        console.log('FAIL', label, (e as Error).name, String((e as Error).message || e).slice(0, 160));
    }
}

await check('usage+ext', () =>
    assumeRoleAndReadInstanceInventory('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'nw-7f31c2'),
);
await check('usage+wrong-ext', () =>
    assumeRoleAndReadInstanceInventory('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'wrong'),
);
await check('reports-only (assume ok, describe denied)', () =>
    assumeRoleAndReadInstanceInventory('arn:aws:iam::300000000011:role/meteringco-reports-reader', 'nw-a01b'),
);
await check('open scraper no ext', () =>
    assumeRoleAndReadInstanceInventory('arn:aws:iam::300000000011:role/meteringco-open-scraper'),
);
