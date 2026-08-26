import { BadRequestException } from '@nestjs/common';
import {
    normalizeCloudIAMForSave,
    proveScraperRoleCanBeAssumed,
    scraperRoleIsDisconnect,
    scraperRoleNamesNoRole,
} from './scraperRole.js';

const mockCredentialsFn = jest.fn();
const mockSend = jest.fn();

jest.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: jest.fn(() => mockCredentialsFn),
}));

jest.mock('@aws-sdk/client-ec2', () => ({
    EC2Client: jest.fn().mockImplementation(() => ({
        send: mockSend,
    })),
    DescribeInstancesCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('scraperRole', () => {
    beforeEach(() => {
        mockCredentialsFn.mockReset();
        mockSend.mockReset();
        mockCredentialsFn.mockResolvedValue({ accessKeyId: 'ASIA' });
        mockSend.mockResolvedValue({ Reservations: [] });
    });

    it('treats a blank role as disconnect', () => {
        expect(scraperRoleIsDisconnect({ iamRoleArn: '', externalId: 'x' })).toBe(true);
        expect(scraperRoleIsDisconnect({ iamRoleArn: 'arn:aws:iam::1:role/x' })).toBe(false);
    });

    it('treats a missing role as invalid rather than disconnect', () => {
        expect(scraperRoleNamesNoRole({ externalId: 'x' })).toBe(true);
        expect(scraperRoleNamesNoRole({ iamRoleArn: '' })).toBe(false);
        expect(scraperRoleNamesNoRole({ iamRoleArn: 'arn:aws:iam::1:role/x' })).toBe(false);
    });

    it('clears the external id on disconnect', () => {
        expect(normalizeCloudIAMForSave({ iamRoleArn: '', externalId: 'keep-me-not' })).toEqual({
            iamRoleArn: '',
            externalId: '',
        });
    });

    it('proves assume-role and inventory read succeed', async () => {
        await expect(
            proveScraperRoleCanBeAssumed({
                iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper',
                externalId: 'ext-123',
            }),
        ).resolves.toBeUndefined();
        expect(mockCredentialsFn).toHaveBeenCalledTimes(1);
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('is a bad request when assume-role fails', async () => {
        mockCredentialsFn.mockRejectedValue(new Error('AccessDenied'));
        await expect(
            proveScraperRoleCanBeAssumed({
                iamRoleArn: 'arn:aws:iam::600000000042:role/unassumable',
                externalId: 'ext-123',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('is a bad request when inventory read fails after assume-role', async () => {
        mockSend.mockRejectedValue(new Error('AccessDenied'));
        await expect(
            proveScraperRoleCanBeAssumed({
                iamRoleArn: 'arn:aws:iam::600000000042:role/no-ec2',
                externalId: 'ext-123',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockCredentialsFn).toHaveBeenCalledTimes(1);
    });
});
