import { BadRequestException } from '@nestjs/common';
import { prepareCloudIamForSave } from '/app/src/utils/aws/scraperRole.ts';

async function expectReject(label: string, input: any) {
    try {
        const res = await prepareCloudIamForSave(input);
        console.log('FAIL', label, 'expected reject, got', res);
        process.exitCode = 1;
    } catch (e) {
        const ok = e instanceof BadRequestException;
        const body = ok ? (e as BadRequestException).getResponse() : e;
        console.log(ok ? 'OK  reject' : 'FAIL unexpected', label, JSON.stringify(body));
        if (!ok) process.exitCode = 1;
    }
}

async function expectAccept(label: string, input: any, expected: any) {
    try {
        const res = await prepareCloudIamForSave(input);
        const match = JSON.stringify(res) === JSON.stringify(expected);
        console.log(match ? 'OK  accept' : 'FAIL mismatch', label, res);
        if (!match) process.exitCode = 1;
    } catch (e) {
        console.log('FAIL unexpected reject', label, e);
        process.exitCode = 1;
    }
}

async function main() {
    await expectAccept(
        'usage-scraper with matching external id',
        { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper', externalId: 'nw-7f31c2' },
        { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper', externalId: 'nw-7f31c2' },
    );
    await expectAccept(
        'open-scraper no ext',
        { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-open-scraper' },
        { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-open-scraper' },
    );
    await expectAccept(
        'staging-scraper',
        { iamRoleArn: 'arn:aws:iam::300000000022:role/meteringco-staging-scraper', externalId: 'nw-stg-4410' },
        { iamRoleArn: 'arn:aws:iam::300000000022:role/meteringco-staging-scraper', externalId: 'nw-stg-4410' },
    );
    await expectAccept('blank role disconnect', { iamRoleArn: '', externalId: 'keep-me-not' }, { iamRoleArn: '' });
    await expectReject('no role named', {});
    await expectReject('only external id', { externalId: 'nw-7f31c2' });
    await expectReject('wrong external id', {
        iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
        externalId: 'wrong',
    });
    await expectReject('missing required ext', { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper' });
    await expectReject('reports-reader no inventory', {
        iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-reports-reader',
        externalId: 'nw-a01b',
    });
    await expectReject('spend-reader no inventory', { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-spend-reader' });
    await expectReject('bare role no inventory', { iamRoleArn: 'arn:aws:iam::300000000022:role/meteringco-bare-role' });
    await expectReject('wrong principal', { iamRoleArn: 'arn:aws:iam::300000000011:role/deployment-pipeline' });
    await expectReject('instance profile', { iamRoleArn: 'arn:aws:iam::300000000022:role/ec2-instance-profile' });
    await expectReject('fake role', { iamRoleArn: 'wow a fake role', externalId: 'foobar' });
    console.log('done, exit', process.exitCode ?? 0);
}

main();
