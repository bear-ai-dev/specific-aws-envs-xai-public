import { assumeRoleAndReadInstanceInventory } from './sts.js';

const USAGE_SCRAPER = 'arn:aws:iam::300000000011:role/meteringco-usage-scraper';
const OPEN_SCRAPER = 'arn:aws:iam::300000000011:role/meteringco-open-scraper';
const REPORTS_READER = 'arn:aws:iam::300000000011:role/meteringco-reports-reader';
const STAGING_SCRAPER = 'arn:aws:iam::300000000022:role/meteringco-staging-scraper';
const BARE_ROLE = 'arn:aws:iam::300000000022:role/meteringco-bare-role';
const DEPLOYMENT = 'arn:aws:iam::300000000011:role/deployment-pipeline';

describe('assumeRoleAndReadInstanceInventory', () => {
    it('assumes a role with the matching external id and reads instance inventory', async () => {
        await expect(assumeRoleAndReadInstanceInventory(USAGE_SCRAPER, 'nw-7f31c2')).resolves.toBeUndefined();
    });

    it('assumes a role that does not require an external id', async () => {
        await expect(assumeRoleAndReadInstanceInventory(OPEN_SCRAPER)).resolves.toBeUndefined();
    });

    it('assumes a staging scraper with its external id and reads inventory', async () => {
        await expect(assumeRoleAndReadInstanceInventory(STAGING_SCRAPER, 'nw-stg-4410')).resolves.toBeUndefined();
    });

    it('rejects a role when the external id does not match', async () => {
        await expect(assumeRoleAndReadInstanceInventory(USAGE_SCRAPER, 'wrong-id')).rejects.toBeDefined();
    });

    it('rejects a role that requires an external id when none is supplied', async () => {
        await expect(assumeRoleAndReadInstanceInventory(USAGE_SCRAPER)).rejects.toBeDefined();
    });

    it('rejects a role whose credentials cannot describe instances', async () => {
        await expect(assumeRoleAndReadInstanceInventory(REPORTS_READER, 'nw-a01b')).rejects.toBeDefined();
    });

    it('rejects a role that can be assumed but grants no inventory access', async () => {
        await expect(assumeRoleAndReadInstanceInventory(BARE_ROLE)).rejects.toBeDefined();
    });

    it('rejects a role whose trust policy does not name the platform account', async () => {
        await expect(assumeRoleAndReadInstanceInventory(DEPLOYMENT)).rejects.toBeDefined();
    });
});
