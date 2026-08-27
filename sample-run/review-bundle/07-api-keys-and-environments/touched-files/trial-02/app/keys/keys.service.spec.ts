import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { createMock } from '@golevelup/ts-jest';
import { KeysService } from './keys.service.js';
import { InfluxService } from '../influx/influx.service.js';
import { EnvironmentService, UsersService } from '../users/users.service.js';
import { Environment } from '../users/dto/Environment.js';
import { KeyEntity } from './entities/key.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';

jest.mock('./entities/key.entity.js', () => {
    const actual = jest.requireActual('./entities/key.entity.js');
    return {
        ...actual,
        KeyEntity: {
            toSubject: actual.KeyEntity.toSubject,
            toClientId: actual.KeyEntity.toClientId,
            isMachineCredentialSubject: actual.KeyEntity.isMachineCredentialSubject,
            getManagementToken: jest.fn(),
            listClients: jest.fn(),
            rotateSecret: jest.fn(),
            deleteClient: jest.fn(),
            getClient: jest.fn(),
        },
    };
});

describe('KeysService', () => {
    let service: KeysService;
    let usersService: UsersService;
    let environmentService: EnvironmentService;
    let influxService: InfluxService;

    const harborlineProdUsers = [
        new UserEntity({
            subject: 'auth0|opharborline77',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
        }),
        new UserEntity({
            subject: 'keyHarborlineProdIngest@clients',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
        }),
        new UserEntity({
            subject: 'keyHarborlineProdReports@clients',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
        }),
    ];

    const idpClients = [
        { client_id: 'keyHarborlineProdIngest', name: 'Harborline production ingest', app_type: 'non_interactive' },
        { client_id: 'keyHarborlineProdReports', name: 'Harborline production reporting', app_type: 'non_interactive' },
        { client_id: 'keyHarborlineSbxIngest', name: 'Harborline sandbox ingest', app_type: 'non_interactive' },
        { client_id: 'keyCrestfallProdIngest', name: 'Crestfall production ingest', app_type: 'non_interactive' },
        { client_id: 'appHarborlineStatusBoard', name: 'Harborline public status board', app_type: 'non_interactive' },
    ];

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get<KeysService>(KeysService);
        usersService = module.get<UsersService>(UsersService);
        environmentService = module.get<EnvironmentService>(EnvironmentService);
        influxService = module.get<InfluxService>(InfluxService);

        jest.spyOn(environmentService, 'getCurrentEnvironment').mockResolvedValue({
            message: 'Found environment',
            subject: 'auth0|opharborline77',
            environment: Environment.PRODUCTION,
        });
        jest.spyOn(usersService, 'findAllUsersForBusinessID').mockResolvedValue({
            message: 'Found users',
            data: harborlineProdUsers,
        });
        (KeyEntity.getManagementToken as jest.Mock).mockResolvedValue('mgmt-token');
        (KeyEntity.listClients as jest.Mock).mockResolvedValue(idpClients);
        (KeyEntity.rotateSecret as jest.Mock).mockResolvedValue({
            client_id: 'keyHarborlineProdIngest',
            client_secret: 'sk_new_secret',
        });
        (KeyEntity.deleteClient as jest.Mock).mockResolvedValue(undefined);
        jest.spyOn(influxService, 'getPoint').mockReturnValue({
            tag: jest.fn().mockReturnThis(),
            stringField: jest.fn().mockReturnThis(),
        } as any);
        jest.spyOn(influxService, 'loadPoints').mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('lists only machine credentials the current account holds in the current environment', async () => {
        const result = await service.findAll({ subject: 'auth0|opharborline77', businessID: 'harborline' });
        expect(result.data.map((key) => key.client_id).sort()).toEqual([
            'keyHarborlineProdIngest',
            'keyHarborlineProdReports',
        ]);
        expect(result.data.find((key) => key.client_id === 'keyHarborlineSbxIngest')).toBeUndefined();
        expect(result.data.find((key) => key.client_id === 'keyCrestfallProdIngest')).toBeUndefined();
        expect(result.data.find((key) => key.client_id === 'appHarborlineStatusBoard')).toBeUndefined();
        expect(KeyEntity.listClients).toHaveBeenCalled();
    });

    it('rotates only the named credential and returns the new secret', async () => {
        const result = await service.rotate({
            keyId: 'keyHarborlineProdIngest',
            subject: 'auth0|opharborline77',
            businessID: 'harborline',
        });
        expect(result.client_secret).toBe('sk_new_secret');
        expect(KeyEntity.rotateSecret).toHaveBeenCalledTimes(1);
        expect(KeyEntity.rotateSecret).toHaveBeenCalledWith('keyHarborlineProdIngest', 'mgmt-token');
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
    });

    it('refuses to rotate a credential the current account does not hold and leaves it untouched', async () => {
        await expect(
            service.rotate({
                keyId: 'keyCrestfallProdIngest',
                subject: 'auth0|opharborline77',
                businessID: 'harborline',
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
    });

    it('refuses to rotate a credential that belongs to the other environment', async () => {
        await expect(
            service.rotate({
                keyId: 'keyHarborlineSbxIngest',
                subject: 'auth0|opharborline77',
                businessID: 'harborline',
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
    });

    it('refuses to rotate a retired credential', async () => {
        await expect(
            service.rotate({
                keyId: 'keyHarborlineProdRetired',
                subject: 'auth0|opharborline77',
                businessID: 'harborline',
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
    });

    it('retires a credential at the identity provider and removes it from tenant configuration', async () => {
        const result = await service.retire({
            keyId: 'keyHarborlineProdReports',
            subject: 'auth0|opharborline77',
            businessID: 'harborline',
        });
        expect(result.message).toBeDefined();
        expect(KeyEntity.deleteClient).toHaveBeenCalledWith('keyHarborlineProdReports', 'mgmt-token');
        expect(influxService.loadPoints).toHaveBeenCalledTimes(1);
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
    });

    it('refuses to retire a credential the current account does not hold', async () => {
        await expect(
            service.retire({
                keyId: 'keyCrestfallProdIngest',
                subject: 'auth0|opharborline77',
                businessID: 'harborline',
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
        expect(influxService.loadPoints).not.toHaveBeenCalled();
    });
});
