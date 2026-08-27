import { createMock } from '@golevelup/ts-jest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxService } from '../influx/influx.service.js';
import { Environment } from '../users/dto/Environment.js';
import { KeyEntity } from './entities/key.entity.js';
import { KeysService } from './keys.service.js';

describe('KeysService', () => {
    let service: KeysService;
    let influxService: InfluxService;
    const harborlineUsers = [
        {
            subject: 'keyHarborlineProdIngest@clients',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
            _field: 'userStatus',
            _value: 'live',
        },
        {
            subject: 'keyHarborlineProdReports@clients',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
            _field: 'userStatus',
            _value: 'live',
        },
        {
            subject: 'auth0|opharborline77',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
            _field: 'userStatus',
            _value: 'live',
        },
    ];

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get<KeysService>(KeysService);
        influxService = module.get<InfluxService>(InfluxService);
        jest.spyOn(KeyEntity, 'listClients').mockResolvedValue([
            { client_id: 'keyHarborlineProdIngest', name: 'Harborline production ingest', app_type: 'non_interactive' },
            {
                client_id: 'keyHarborlineProdReports',
                name: 'Harborline production reporting',
                app_type: 'non_interactive',
            },
            { client_id: 'keyCrestfallProdIngest', name: 'Crestfall production ingest', app_type: 'non_interactive' },
            { client_id: 'sessHarborlineConsole01', name: 'Harborline console sign-in', app_type: 'spa' },
        ]);
        jest.spyOn(KeyEntity, 'rotateSecret').mockResolvedValue({
            client_id: 'keyHarborlineProdIngest',
            name: 'Harborline production ingest',
            app_type: 'non_interactive',
            client_secret: 'sk_new',
        });
        jest.spyOn(KeyEntity, 'deleteClient').mockResolvedValue(undefined);
        influxService.readAllUsersForBusiness = jest.fn().mockResolvedValue(harborlineUsers);
        influxService.loadPoints = jest.fn().mockResolvedValue(undefined);
        influxService.getPoint = jest.fn().mockReturnValue({ tag: jest.fn(), stringField: jest.fn() });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('lists only machine credentials claimed by the current account', async () => {
        const { data } = await service.findAll({ businessID: 'harborline' });
        expect(influxService.readAllUsersForBusiness).toHaveBeenCalledWith('harborline');
        expect(data.map((key) => key.client_id)).toEqual(['keyHarborlineProdIngest', 'keyHarborlineProdReports']);
    });

    it('rotates the named credential and leaves others untouched', async () => {
        const result = await service.rotate({ keyId: 'keyHarborlineProdIngest', businessID: 'harborline' });
        expect(KeyEntity.rotateSecret).toHaveBeenCalledTimes(1);
        expect(KeyEntity.rotateSecret).toHaveBeenCalledWith('keyHarborlineProdIngest');
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
        expect(result.client_secret).toBe('sk_new');
    });

    it('refuses to rotate a credential the current account does not hold', async () => {
        await expect(
            service.rotate({ keyId: 'keyCrestfallProdIngest', businessID: 'harborline' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
    });

    it('retires a claimed credential at the identity provider and in configuration', async () => {
        const result = await service.retire({ keyId: 'keyHarborlineProdReports', businessID: 'harborline' });
        expect(KeyEntity.deleteClient).toHaveBeenCalledWith('keyHarborlineProdReports');
        expect(influxService.loadPoints).toHaveBeenCalledTimes(1);
        expect(result.message).toBe('Deleted key');
    });

    it('refuses to retire a credential belonging to another environment or tenant', async () => {
        await expect(
            service.retire({ keyId: 'keyHarborlineSbxIngest', businessID: 'harborline' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
        expect(influxService.loadPoints).not.toHaveBeenCalled();
    });
});
