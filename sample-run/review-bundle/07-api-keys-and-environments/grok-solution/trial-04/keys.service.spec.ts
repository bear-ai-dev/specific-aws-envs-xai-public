import { createMock } from '@golevelup/ts-jest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Environment } from '../users/dto/Environment.js';
import { OrganizationEntity } from '../users/entities/organization.entity.js';
import { UsersService } from '../users/users.service.js';
import { KeysService } from './keys.service.js';

const fetchMock = jest.fn();
jest.mock('cross-fetch', () => ({
    fetch: (...args: any[]) => fetchMock(...args),
}));

describe('KeysService', () => {
    let service: KeysService;
    const mockFindAllUsersForBusinessID = jest.fn();
    const mockRetireMachineCredential = jest.fn();

    beforeEach(async () => {
        jest.spyOn(OrganizationEntity, 'getAuth0ManagementToken').mockResolvedValue({ access_token: 'mgmt' });
        mockFindAllUsersForBusinessID.mockResolvedValue({
            message: 'Found users',
            data: [
                {
                    subject: 'keyHarborlineProdIngest@clients',
                    businessID: 'harborline',
                    environment: Environment.PRODUCTION,
                },
                { subject: 'auth0|opharborline77', businessID: 'harborline', environment: Environment.PRODUCTION },
            ],
        });
        mockRetireMachineCredential.mockResolvedValue({ message: 'Deleted key' });

        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker((token) => {
                if (token === UsersService) {
                    return {
                        findAllUsersForBusinessID: mockFindAllUsersForBusinessID,
                        retireMachineCredential: mockRetireMachineCredential,
                    };
                }
                return createMock();
            })
            .compile();

        service = module.get<KeysService>(KeysService);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('lists only machine credentials for the current account', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ client_id: 'keyHarborlineProdIngest', name: 'Harborline production ingest' }),
        });
        const res = await service.findAll({ businessID: 'harborline' });
        expect(res.data).toHaveLength(1);
        expect(res.data[0].keyId).toBe('keyHarborlineProdIngest');
        expect(mockFindAllUsersForBusinessID).toHaveBeenCalledWith({ businessID: 'harborline' });
    });

    it('refuses to rotate a credential the account does not hold', async () => {
        await expect(
            service.rotate({ keyId: 'keyCrestfallProdIngest', businessID: 'harborline' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rotates only the named credential', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                client_id: 'keyHarborlineProdIngest',
                name: 'Harborline production ingest',
                client_secret: 'sk_new',
            }),
        });
        const res = await service.rotate({ keyId: 'keyHarborlineProdIngest', businessID: 'harborline' });
        expect(res.data[0].clientSecret).toBe('sk_new');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain('/clients/keyHarborlineProdIngest/rotate-secret');
    });

    it('retires a held credential at the identity provider and in config', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 204 });
        const res = await service.retire({ keyId: 'keyHarborlineProdIngest', businessID: 'harborline' });
        expect(res.message).toBe('Deleted key');
        expect(String(fetchMock.mock.calls[0][0])).toContain('/clients/keyHarborlineProdIngest');
        expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
        expect(mockRetireMachineCredential).toHaveBeenCalledWith({
            subject: 'keyHarborlineProdIngest@clients',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
        });
    });
});
