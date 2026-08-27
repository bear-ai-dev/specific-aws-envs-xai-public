import { createMock } from '@golevelup/ts-jest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxService } from '../influx/influx.service.js';
import { Environment } from '../users/dto/Environment.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { KeyEntity } from './entities/key.entity.js';
import { KeysService } from './keys.service.js';

describe('KeysService', () => {
    const businessID = 'harborline';
    const sandboxBusinessID = 'harborline-sandbox';
    const ingest = new UserEntity({
        subject: 'keyHarborlineProdIngest@clients',
        businessID,
        environment: Environment.PRODUCTION,
    });
    const reports = new UserEntity({
        subject: 'keyHarborlineProdReports@clients',
        businessID,
        environment: Environment.PRODUCTION,
    });
    const human = new UserEntity({
        subject: 'auth0|opharborline77',
        businessID,
        environment: Environment.PRODUCTION,
    });

    let service: KeysService;
    let usersService: UsersService;
    let influxService: InfluxService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get<KeysService>(KeysService);
        usersService = module.get<UsersService>(UsersService);
        influxService = module.get<InfluxService>(InfluxService);
        jest.spyOn(usersService, 'findAllUsersForBusinessID').mockResolvedValue({
            message: 'Found users',
            data: [ingest, reports, human],
        });
        jest.spyOn(KeyEntity, 'listClients').mockResolvedValue([
            { client_id: 'keyHarborlineProdIngest', name: 'Harborline production ingest' },
            { client_id: 'keyHarborlineProdReports', name: 'Harborline production reporting' },
            { client_id: 'keyHarborlineSbxIngest', name: 'Harborline sandbox ingest' },
            { client_id: 'appHarborlineStatusBoard', name: 'Harborline public status board' },
        ]);
        jest.spyOn(KeyEntity, 'rotateSecret').mockResolvedValue({
            client_id: 'keyHarborlineProdIngest',
            name: 'Harborline production ingest',
            client_secret: 'sk_newsecret',
        });
        jest.spyOn(KeyEntity, 'deleteClient').mockResolvedValue(undefined);
        jest.spyOn(influxService, 'loadPoints').mockResolvedValue(undefined);
        jest.spyOn(influxService, 'getPoint').mockReturnValue({
            tag: jest.fn(),
            stringField: jest.fn(),
        } as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('lists only live machine credentials for the current account', async () => {
        const { data } = await service.findAll({ businessID });
        expect(data.map((key) => key.keyId).sort()).toEqual(['keyHarborlineProdIngest', 'keyHarborlineProdReports']);
        expect(usersService.findAllUsersForBusinessID).toHaveBeenCalledWith({ businessID });
    });

    it('does not list credentials that belong to another environment or were never claimed', async () => {
        const { data } = await service.findAll({ businessID });
        expect(data.find((key) => key.keyId === 'keyHarborlineSbxIngest')).toBeUndefined();
        expect(data.find((key) => key.keyId === 'appHarborlineStatusBoard')).toBeUndefined();
    });

    it('rotates only the named credential', async () => {
        const result = await service.rotate({ businessID, keyId: 'keyHarborlineProdIngest' });
        expect(result.clientSecret).toBe('sk_newsecret');
        expect(KeyEntity.rotateSecret).toHaveBeenCalledTimes(1);
        expect(KeyEntity.rotateSecret).toHaveBeenCalledWith('keyHarborlineProdIngest');
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
    });

    it('refuses to rotate a credential the current account does not hold', async () => {
        await expect(service.rotate({ businessID, keyId: 'keyHarborlineSbxIngest' })).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.rotate({ businessID, keyId: 'keyCrestfallProdIngest' })).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.rotate({ businessID, keyId: 'appHarborlineStatusBoard' })).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
    });

    it('refuses a retired credential and leaves it untouched', async () => {
        jest.spyOn(usersService, 'findAllUsersForBusinessID').mockResolvedValue({
            message: 'Found users',
            data: [reports],
        });
        await expect(service.rotate({ businessID, keyId: 'keyHarborlineProdRetired' })).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(service.retire({ businessID, keyId: 'keyHarborlineProdRetired' })).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
        expect(influxService.loadPoints).not.toHaveBeenCalled();
    });

    it('retires the credential at the identity provider and removes the account it signs in as', async () => {
        const result = await service.retire({ businessID, keyId: 'keyHarborlineProdIngest' });
        expect(result.message).toBe('Key deleted successfully');
        expect(KeyEntity.deleteClient).toHaveBeenCalledWith('keyHarborlineProdIngest');
        expect(influxService.loadPoints).toHaveBeenCalledTimes(1);
    });

    it('does not retire a credential belonging to the other environment of the same tenant', async () => {
        jest.spyOn(usersService, 'findAllUsersForBusinessID').mockResolvedValue({
            message: 'Found users',
            data: [
                new UserEntity({
                    subject: 'keyHarborlineSbxIngest@clients',
                    businessID: sandboxBusinessID,
                    environment: Environment.SANDBOX,
                }),
            ],
        });
        await expect(
            service.retire({ businessID: sandboxBusinessID, keyId: 'keyHarborlineProdIngest' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
        expect(influxService.loadPoints).not.toHaveBeenCalled();
    });
});
