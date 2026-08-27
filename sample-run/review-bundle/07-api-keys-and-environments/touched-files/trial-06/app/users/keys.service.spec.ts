import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-jest';
import { NotFoundException } from '@nestjs/common';
import { InfluxService } from '../influx/influx.service.js';
import { KeysService } from './keys.service.js';
import { UserEntity } from './entities/user.entity.js';
import { Environment } from './dto/Environment.js';
import { OrganizationEntity } from './entities/organization.entity.js';
import { cache as cacheManager } from '../cacheStore.js';

jest.mock('../cacheStore');

const harborlineProd = {
    subject: 'keyHarborlineProdIngest@clients',
    businessID: 'harborline',
    environment: Environment.PRODUCTION,
    _field: 'userStatus',
    _value: 'live',
    _measurement: UserEntity._measurementActiveEnvironment,
    _time: new Date().toISOString(),
};

const harborlineReports = {
    subject: 'keyHarborlineProdReports@clients',
    businessID: 'harborline',
    environment: Environment.PRODUCTION,
    _field: 'userStatus',
    _value: 'live',
    _measurement: UserEntity._measurementActiveEnvironment,
    _time: new Date().toISOString(),
};

const humanUser = {
    subject: 'auth0|opharborline77',
    businessID: 'harborline',
    environment: Environment.PRODUCTION,
    _field: 'userStatus',
    _value: 'live',
    _measurement: UserEntity._measurementActiveEnvironment,
    _time: new Date().toISOString(),
};

describe('KeysService', () => {
    let service: KeysService;
    let mockReadAllUsersForBusiness: jest.Mock;
    let mockLoadPoints: jest.Mock;
    let getClient: jest.SpyInstance;
    let rotateSecret: jest.SpyInstance;
    let deleteClient: jest.SpyInstance;

    beforeEach(async () => {
        mockReadAllUsersForBusiness = jest.fn(async () => [harborlineProd, harborlineReports, humanUser]);
        mockLoadPoints = jest.fn(async () => undefined);
        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker(createMock)
            .useMocker((token) => {
                if (token === InfluxService) {
                    return {
                        readAllUsersForBusiness: mockReadAllUsersForBusiness,
                        loadPoints: mockLoadPoints,
                        getPoint: () => ({ tag: jest.fn(), stringField: jest.fn() }),
                    };
                }
            })
            .compile();
        service = module.get<KeysService>(KeysService);

        jest.spyOn(OrganizationEntity, 'getAuth0ManagementToken').mockResolvedValue({ access_token: 'mgmt' });
        getClient = jest.spyOn(service as any, 'getAuth0Client').mockImplementation(async (clientId: string) => ({
            client_id: clientId,
            name: `${clientId} name`,
        }));
        rotateSecret = jest.spyOn(service as any, 'rotateAuth0Secret').mockImplementation(async (clientId: string) => ({
            client_id: clientId,
            client_secret: 'fresh-secret',
        }));
        deleteClient = jest.spyOn(service as any, 'deleteAuth0Client').mockResolvedValue(undefined);
        (cacheManager.del as jest.Mock) = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it('lists only machine credentials for the current account', async () => {
        const result = await service.findAll({ businessID: 'harborline' });
        expect(result.data.map((k) => k.client_id).sort()).toEqual([
            'keyHarborlineProdIngest',
            'keyHarborlineProdReports',
        ]);
        expect(result.data.find((k) => k.subject === 'auth0|opharborline77')).toBeUndefined();
    });

    it('rotates only the named credential', async () => {
        const result = await service.rotate({ keyId: 'keyHarborlineProdIngest', businessID: 'harborline' });
        expect(result.client_secret).toBe('fresh-secret');
        expect(rotateSecret).toHaveBeenCalledTimes(1);
        expect(rotateSecret).toHaveBeenCalledWith('keyHarborlineProdIngest', 'mgmt');
        expect(deleteClient).not.toHaveBeenCalled();
    });

    it('refuses to rotate a credential the account does not hold', async () => {
        await expect(
            service.rotate({ keyId: 'keyCrestfallProdIngest', businessID: 'harborline' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(rotateSecret).not.toHaveBeenCalled();
        expect(deleteClient).not.toHaveBeenCalled();
    });

    it('retires a credential at the identity provider and in configuration', async () => {
        const result = await service.retire({ keyId: 'keyHarborlineProdReports', businessID: 'harborline' });
        expect(result.message).toBeDefined();
        expect(deleteClient).toHaveBeenCalledWith('keyHarborlineProdReports', 'mgmt');
        expect(mockLoadPoints).toHaveBeenCalledTimes(1);
    });

    it('refuses to retire a credential the account does not hold and leaves it untouched', async () => {
        await expect(
            service.retire({ keyId: 'keyCrestfallProdIngest', businessID: 'harborline' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(deleteClient).not.toHaveBeenCalled();
        expect(mockLoadPoints).not.toHaveBeenCalled();
    });
});
