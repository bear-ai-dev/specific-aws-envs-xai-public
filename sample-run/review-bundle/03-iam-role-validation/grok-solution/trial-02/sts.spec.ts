import { BadRequestException } from '@nestjs/common';
import { mockClient } from 'aws-sdk-client-mock';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { proveScraperRoleCanCollect } from './sts.js';

const stsMock = mockClient(STSClient);
const ec2Mock = mockClient(EC2Client);

describe('proveScraperRoleCanCollect', () => {
    beforeEach(() => {
        stsMock.reset();
        ec2Mock.reset();
    });

    it('should succeed when the role can be assumed and inventory can be read', async () => {
        stsMock.on(AssumeRoleCommand).resolves({
            Credentials: {
                AccessKeyId: 'ASIAOK',
                SecretAccessKey: 'secret',
                SessionToken: 'token',
                Expiration: new Date(),
            },
        });
        ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [] });

        await expect(
            proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'nw-7f31c2'),
        ).resolves.toBeUndefined();
        expect(stsMock.calls()).toHaveLength(1);
        expect(ec2Mock.calls()).toHaveLength(1);
    });

    it('should be a bad request when the role cannot be assumed', async () => {
        stsMock.on(AssumeRoleCommand).rejects(new Error('AccessDenied'));

        await expect(
            proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'wrong'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(ec2Mock.calls()).toHaveLength(0);
    });

    it('should be a bad request when assumed credentials cannot describe instances', async () => {
        stsMock.on(AssumeRoleCommand).resolves({
            Credentials: {
                AccessKeyId: 'ASIAOK',
                SecretAccessKey: 'secret',
                SessionToken: 'token',
                Expiration: new Date(),
            },
        });
        ec2Mock.on(DescribeInstancesCommand).rejects(new Error('UnauthorizedOperation'));

        await expect(
            proveScraperRoleCanCollect('arn:aws:iam::300000000011:role/meteringco-reports-reader', 'nw-a01b'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
