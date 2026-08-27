import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-jest';
import { NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { KeysService } from './keys.service.js';
import { UsersService } from '../users/users.service.js';
import { InfluxService } from '../influx/influx.service.js';
import { Environment } from '../users/dto/Environment.js';
import { cache as cacheManager } from '../cacheStore.js';
import { OrganizationEntity } from '../users/entities/organization.entity.js';

jest.mock('../cacheStore');
jest.mock('cross-fetch', () => ({
    fetch: jest.fn(),
}));

const harborlineProdKeys = [
    {
        subject: 'keyHarborlineProdIngest@clients',
        businessID: 'harborline',
        environment: Environment.PRODUCTION,
    },
    {
        subject: 'keyHarborlineProdReports@clients',
        businessID: 'harborline',
        environment: Environment.PRODUCTION,
    },
];

describe('KeysService', () => {
    let service: KeysService;
    let mockFindAllUsersForBusinessID: jest.Mock;
    let mockLoadPoints: jest.Mock;
    const fetchMock = fetch as unknown as jest.Mock;

    beforeEach(async () => {
        mockFindAllUsersForBusinessID = jest.fn(async () => ({ message: 'Found users', data: harborlineProdKeys }));
        mockLoadPoints = jest.fn();
        fetchMock.mockReset();
        jest.spyOn(OrganizationEntity, 'getAuth0ManagementToken').mockResolvedValue({ access_token: 'mgmt-token' });
        cacheManager.del = jest.fn();

        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker(createMock)
            .useMocker((token) => {
                if (token === UsersService) {
                    return { findAllUsersForBusinessID: mockFindAllUsersForBusinessID };
                }
                if (token === InfluxService) {
                    return {
                        loadPoints: mockLoadPoints,
                        getPoint: () => ({ tag: jest.fn(), stringField: jest.fn() }),
                    };
                }
            })
            .compile();

        service = module.get<KeysService>(KeysService);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('lists only machine credentials for the current account', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => [
                { client_id: 'keyHarborlineProdIngest', name: 'Harborline production ingest' },
                { client_id: 'keyHarborlineProdReports', name: 'Harborline production reporting' },
                { client_id: 'keyCrestfallProdIngest', name: 'Crestfall production ingest' },
            ],
        });

        const result = await service.findAll({ businessID: 'harborline' });
        expect(result.data.map((key) => key.keyId).sort()).toEqual([
            'keyHarborlineProdIngest',
            'keyHarborlineProdReports',
        ]);
        expect(result.data.find((key) => key.keyId === 'keyCrestfallProdIngest')).toBeUndefined();
    });

    it('rotates only the named credential that the account holds', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                client_id: 'keyHarborlineProdIngest',
                name: 'Harborline production ingest',
                client_secret: 'sk_new_secret',
            }),
        });

        const result = await service.rotate({ businessID: 'harborline', keyId: 'keyHarborlineProdIngest' });
        expect(result.data.clientSecret).toBe('sk_new_secret');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('/clients/keyHarborlineProdIngest/rotate-secret');
    });

    it('refuses to rotate a credential the current account does not hold', async () => {
        await expect(
            service.rotate({ businessID: 'harborline', keyId: 'keyCrestfallProdIngest' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses to rotate a retired credential and does not touch the identity provider', async () => {
        mockFindAllUsersForBusinessID.mockResolvedValue({ message: 'Found users', data: [] });
        await expect(
            service.rotate({ businessID: 'harborline', keyId: 'keyHarborlineProdRetired' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('retires a credential at the identity provider and removes it from tenant configuration', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
        const result = await service.retire({ businessID: 'harborline', keyId: 'keyHarborlineProdReports' });
        expect(result.message).toBe('Deleted key');
        expect(fetchMock.mock.calls[0][0]).toContain('/clients/keyHarborlineProdReports');
        expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
        expect(mockLoadPoints).toHaveBeenCalledTimes(1);
        expect(cacheManager.del).toHaveBeenCalledWith('keyHarborlineProdReports@clients');
    });

    it('refuses to retire a credential belonging to another tenant or environment', async () => {
        await expect(
            service.retire({ businessID: 'harborline', keyId: 'keyHarborlineSbxIngest' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mockLoadPoints).not.toHaveBeenCalled();
    });
});
