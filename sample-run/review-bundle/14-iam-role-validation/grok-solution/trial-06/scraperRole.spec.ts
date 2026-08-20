import { BadRequestException } from '@nestjs/common';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { normalizeCloudIamForSave, prepareCloudIamForSave, InvalidIamRoleMessage } from './scraperRole.js';

describe('scraperRole', () => {
    describe('normalizeCloudIamForSave', () => {
        it('treats a blank role as a disconnect and drops the external id', () => {
            expect(normalizeCloudIamForSave({ iamRoleArn: '', externalId: 'nw-7f31c2' })).toEqual({ iamRoleArn: '' });
            expect(normalizeCloudIamForSave({ iamRoleArn: '   ' })).toEqual({ iamRoleArn: '' });
        });

        it('rejects a settings block that names no role', () => {
            expect(() => normalizeCloudIamForSave({})).toThrow(BadRequestException);
            expect(() => normalizeCloudIamForSave({ externalId: 'nw-7f31c2' })).toThrow(BadRequestException);
            expect(() => normalizeCloudIamForSave(undefined)).toThrow(BadRequestException);
            expect(() => normalizeCloudIamForSave(null)).toThrow(BadRequestException);
        });

        it('keeps a present role and drops a blank external id', () => {
            expect(
                normalizeCloudIamForSave({
                    iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                    externalId: '',
                }),
            ).toEqual({ iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper' });
        });
    });

    describe('prepareCloudIamForSave', () => {
        const usageScraper = 'arn:aws:iam::300000000011:role/meteringco-usage-scraper';
        const openScraper = 'arn:aws:iam::300000000011:role/meteringco-open-scraper';
        const reportsReader = 'arn:aws:iam::300000000011:role/meteringco-reports-reader';
        const spendReader = 'arn:aws:iam::300000000011:role/meteringco-spend-reader';
        const stagingScraper = 'arn:aws:iam::300000000022:role/meteringco-staging-scraper';
        const bareRole = 'arn:aws:iam::300000000022:role/meteringco-bare-role';
        const pipeline = 'arn:aws:iam::300000000011:role/deployment-pipeline';

        it('accepts a role that can be assumed with the supplied external id and can read inventory', async () => {
            await expect(
                prepareCloudIamForSave({ iamRoleArn: usageScraper, externalId: 'nw-7f31c2' }),
            ).resolves.toEqual({ iamRoleArn: usageScraper, externalId: 'nw-7f31c2' });
        });

        it('accepts an open role that does not require an external id', async () => {
            await expect(prepareCloudIamForSave({ iamRoleArn: openScraper })).resolves.toEqual({
                iamRoleArn: openScraper,
            });
        });

        it('accepts a staging scraper with the matching external id', async () => {
            await expect(
                prepareCloudIamForSave({ iamRoleArn: stagingScraper, externalId: 'nw-stg-4410' }),
            ).resolves.toEqual({ iamRoleArn: stagingScraper, externalId: 'nw-stg-4410' });
        });

        it('rejects a role when the external id does not match', async () => {
            await expect(
                prepareCloudIamForSave({ iamRoleArn: usageScraper, externalId: 'wrong' }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('rejects a role that requires an external id when none is supplied', async () => {
            await expect(prepareCloudIamForSave({ iamRoleArn: usageScraper })).rejects.toBeInstanceOf(
                BadRequestException,
            );
        });

        it('rejects a role that can be assumed but cannot read instance inventory', async () => {
            await expect(
                prepareCloudIamForSave({ iamRoleArn: reportsReader, externalId: 'nw-a01b' }),
            ).rejects.toBeInstanceOf(BadRequestException);
            await expect(prepareCloudIamForSave({ iamRoleArn: spendReader })).rejects.toBeInstanceOf(
                BadRequestException,
            );
            await expect(prepareCloudIamForSave({ iamRoleArn: bareRole })).rejects.toBeInstanceOf(BadRequestException);
        });

        it('rejects a role whose trust policy does not name the platform account', async () => {
            await expect(prepareCloudIamForSave({ iamRoleArn: pipeline })).rejects.toBeInstanceOf(BadRequestException);
        });

        it('disconnects without calling AWS when the role is blank', async () => {
            const assumeSpy = jest.spyOn(STSClient.prototype, 'send');
            const describeSpy = jest.spyOn(EC2Client.prototype, 'send');
            await expect(prepareCloudIamForSave({ iamRoleArn: '', externalId: 'should-be-cleared' })).resolves.toEqual({
                iamRoleArn: '',
            });
            expect(assumeSpy).not.toHaveBeenCalled();
            expect(describeSpy).not.toHaveBeenCalled();
            assumeSpy.mockRestore();
            describeSpy.mockRestore();
        });

        it('does not write anything when either check fails', async () => {
            await expect(
                prepareCloudIamForSave({ iamRoleArn: usageScraper, externalId: 'wrong' }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('omits a blank external id from AssumeRole', async () => {
            const send = jest.spyOn(STSClient.prototype, 'send').mockImplementation(async (command: any) => {
                if (command instanceof AssumeRoleCommand) {
                    expect(command.input.ExternalId).toBeUndefined();
                    return {
                        Credentials: {
                            AccessKeyId: 'ASIAFAKE',
                            SecretAccessKey: 'secret',
                            SessionToken: 'token',
                        },
                    };
                }
                throw new Error(`unexpected command ${command?.constructor?.name}`);
            });
            const describe = jest.spyOn(EC2Client.prototype, 'send').mockImplementation(async (command: any) => {
                expect(command).toBeInstanceOf(DescribeInstancesCommand);
                return { Reservations: [] };
            });
            await expect(prepareCloudIamForSave({ iamRoleArn: openScraper, externalId: '' })).resolves.toEqual({
                iamRoleArn: openScraper,
            });
            send.mockRestore();
            describe.mockRestore();
        });

        it('surfaces a bad request whose message mentions IAM', async () => {
            try {
                await prepareCloudIamForSave({ iamRoleArn: 'wow a fake role', externalId: 'foobar' });
                throw new Error('expected failure');
            } catch (err) {
                expect(err).toBeInstanceOf(BadRequestException);
                const response = (err as BadRequestException).getResponse() as { message: string[] };
                const messages = Array.isArray(response.message) ? response.message : [response.message ?? String(err)];
                expect(messages[0]).toEqual(expect.stringContaining('IAM'));
                expect(messages[0]).toEqual(InvalidIamRoleMessage);
            }
        });
    });
});
