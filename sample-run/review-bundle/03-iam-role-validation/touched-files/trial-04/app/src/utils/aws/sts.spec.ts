import { BadRequestException } from '@nestjs/common';
import { assumeScraperRole, assertCredentialsCanReadInstanceInventory, proveScraperRoleCanCollect } from './sts.js';

describe('scraper role proof', () => {
    const validRole = 'arn:aws:iam::600000000042:role/meteringco-scraper';
    const noEc2Role = 'arn:aws:iam::600000000042:role/meteringco-scraper-no-ec2';

    it('assumes a role with the supplied external id and reads instance inventory', async () => {
        await expect(
            proveScraperRoleCanCollect({ iamRoleArn: validRole, externalId: 'ext-good' }),
        ).resolves.toBeUndefined();
    });

    it('rejects an external id that cannot assume the role', async () => {
        await expect(
            proveScraperRoleCanCollect({ iamRoleArn: validRole, externalId: 'wrong-id' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a role that cannot be assumed', async () => {
        await expect(
            proveScraperRoleCanCollect({
                iamRoleArn: 'arn:aws:iam::600000000042:role/does-not-exist',
                externalId: 'ext-good',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects assumed credentials that cannot read instance inventory', async () => {
        const credentials = await assumeScraperRole({ iamRoleArn: noEc2Role, externalId: 'ext-no-ec2' });
        await expect(assertCredentialsCanReadInstanceInventory({ credentials })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            proveScraperRoleCanCollect({ iamRoleArn: noEc2Role, externalId: 'ext-no-ec2' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
