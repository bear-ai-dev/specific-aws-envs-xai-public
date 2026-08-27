import { createMock } from '@golevelup/ts-jest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxService } from '../influx/influx.service.js';
import { OrganizationEntity } from '../users/entities/organization.entity.js';
import { Environment } from '../users/dto/Environment.js';
import { UsersService } from '../users/users.service.js';
import { KeysService } from './keys.service.js';

jest.mock('cross-fetch', () => ({
    fetch: jest.fn(),
}));

import { fetch } from 'cross-fetch';

describe('KeysService', () => {
    let service: KeysService;
    let usersService: UsersService;
    const mockLoadPoints = jest.fn();
    const harborlineUsers = [
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

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker(createMock)
            .useMocker((token) => {
                if (token === UsersService) {
                    return {
                        findAllUsersForBusinessID: jest.fn().mockResolvedValue({
                            message: 'Found users',
                            data: harborlineUsers,
                        }),
                    };
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
        usersService = module.get<UsersService>(UsersService);
        jest.spyOn(OrganizationEntity, 'getAuth0ManagementToken').mockResolvedValue({ access_token: 'mgmt.token' });
        (fetch as jest.Mock).mockReset();
        mockLoadPoints.mockReset();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('lists only credentials claimed by the current account', async () => {
        (fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                start: 0,
                limit: 100,
                total: 3,
                clients: [
                    { client_id: 'keyHarborlineProdIngest', name: 'Harborline production ingest' },
                    { client_id: 'keyHarborlineProdReports', name: 'Harborline production reporting' },
                    { client_id: 'keyCrestfallProdIngest', name: 'Crestfall production ingest' },
                ],
            }),
        });
        const result = await service.findAll('harborline');
        expect(result.data.map((key) => key.client_id).sort()).toEqual([
            'keyHarborlineProdIngest',
            'keyHarborlineProdReports',
        ]);
        expect(result.data.find((key) => key.client_id === 'keyCrestfallProdIngest')).toBeUndefined();
    });

    it('refuses to rotate a credential the current account does not hold', async () => {
        await expect(service.rotate('harborline', 'keyCrestfallProdIngest')).rejects.toBeInstanceOf(NotFoundException);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rotates only the named credential', async () => {
        (fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                client_id: 'keyHarborlineProdIngest',
                client_secret: 'sk_new',
                name: 'Harborline production ingest',
            }),
        });
        const result = await service.rotate('harborline', 'keyHarborlineProdIngest');
        expect(result.client_secret).toBe('sk_new');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect((fetch as jest.Mock).mock.calls[0][0]).toContain(
            '/api/v2/clients/keyHarborlineProdIngest/rotate-secret',
        );
    });

    it('refuses to retire a credential belonging to another environment of the tenant', async () => {
        await expect(service.retire('harborline', 'keyHarborlineSbxIngest')).rejects.toBeInstanceOf(NotFoundException);
        expect(fetch).not.toHaveBeenCalled();
        expect(mockLoadPoints).not.toHaveBeenCalled();
    });
});
