import { BadRequestException } from '@nestjs/common';
import { validateScraperRole } from './sts.js';

describe('validateScraperRole', () => {
    it('accepts a role that can be assumed with the supplied external id and can read instance inventory', async () => {
        await expect(
            validateScraperRole({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            }),
        ).resolves.toBeUndefined();
    });

    it('rejects a role that cannot be assumed with the supplied external id', async () => {
        await expect(
            validateScraperRole({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'wrong-id',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects assumed credentials that cannot read the instance inventory used by collection', async () => {
        await expect(
            validateScraperRole({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-reports-reader',
                externalId: 'nw-a01b',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
