import { createMock } from '@golevelup/ts-jest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InfluxService } from '../influx/influx.service.js';
import { Environment } from '../users/dto/Environment.js';
import { KeyEntity } from './entities/key.entity.js';
import { KeysService } from './keys.service.js';

jest.mock('./entities/key.entity.js');

describe('KeysService', () => {
    let service: KeysService;
    let influxService: InfluxService;
    const harborlineBindings = [
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
        {
            subject: 'auth0|opharborline77',
            businessID: 'harborline',
            environment: Environment.PRODUCTION,
        },
    ];

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [KeysService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get(KeysService);
        influxService = module.get(InfluxService);
        jest.spyOn(influxService, 'readAllUsersForBusiness').mockResolvedValue(harborlineBindings as any);
        jest.spyOn(influxService, 'loadPoints').mockResolvedValue(undefined as any);
        (KeyEntity.subjectForClient as jest.Mock).mockImplementation((id: string) => `${id}@clients`);
        (KeyEntity.clientIdFromSubject as jest.Mock).mockImplementation((subject: string) =>
            subject.endsWith('@clients') ? subject.slice(0, -'@clients'.length) : undefined,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('lists only machine credentials claimed by the current account', async () => {
        (KeyEntity.listClients as jest.Mock).mockResolvedValue([
            { client_id: 'keyHarborlineProdIngest', name: 'Harborline production ingest', app_type: 'non_interactive' },
            { client_id: 'keyHarborlineProdReports', name: 'Harborline production reporting', app_type: 'non_interactive' },
            { client_id: 'keyCrestfallProdIngest', name: 'Crestfall production ingest', app_type: 'non_interactive' },
            { client_id: 'appHarborlineStatusBoard', name: 'Harborline public status board', app_type: 'non_interactive' },
        ]);

        const result = await service.findAll({ businessID: 'harborline' });
        expect(result.data.map((key) => key.keyId).sort()).toEqual([
            'keyHarborlineProdIngest',
            'keyHarborlineProdReports',
        ]);
    });

    it('refuses to rotate a key the current account does not hold', async () => {
        await expect(
            service.rotate({ businessID: 'harborline', keyId: 'keyCrestfallProdIngest' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
    });

    it('rotates only the named credential', async () => {
        (KeyEntity.getClient as jest.Mock).mockResolvedValue({
            client_id: 'keyHarborlineProdIngest',
            name: 'Harborline production ingest',
            app_type: 'non_interactive',
        });
        (KeyEntity.rotateSecret as jest.Mock).mockResolvedValue({
            client_id: 'keyHarborlineProdIngest',
            name: 'Harborline production ingest',
            app_type: 'non_interactive',
            client_secret: 'sk_new',
        });

        const result = await service.rotate({ businessID: 'harborline', keyId: 'keyHarborlineProdIngest' });
        expect(KeyEntity.rotateSecret).toHaveBeenCalledTimes(1);
        expect(KeyEntity.rotateSecret).toHaveBeenCalledWith('keyHarborlineProdIngest');
        expect(result.data.clientSecret).toEqual('sk_new');
    });

    it('refuses to retire a key the current account does not hold', async () => {
        await expect(
            service.retire({ businessID: 'harborline', keyId: 'keyCrestfallProdIngest' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
        expect(influxService.loadPoints).not.toHaveBeenCalled();
    });

    it('retires a claimed credential at the identity provider and in config', async () => {
        (KeyEntity.deleteClient as jest.Mock).mockResolvedValue(undefined);
        await service.retire({ businessID: 'harborline', keyId: 'keyHarborlineProdIngest' });
        expect(KeyEntity.deleteClient).toHaveBeenCalledWith('keyHarborlineProdIngest');
        expect(influxService.loadPoints).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['keyHarborlineSbxIngest', 'other environment'],
        ['keyHarborlineProdRetired', 'already retired'],
        ['appHarborlineStatusBoard', 'never claimed at the tenant'],
        ['keyCrestfallProdIngest', 'another tenant'],
    ])('refuses %s (%s) and leaves it untouched', async (keyId) => {
        await expect(service.rotate({ businessID: 'harborline', keyId })).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.retire({ businessID: 'harborline', keyId })).rejects.toBeInstanceOf(NotFoundException);
        expect(KeyEntity.rotateSecret).not.toHaveBeenCalled();
        expect(KeyEntity.deleteClient).not.toHaveBeenCalled();
        expect(influxService.loadPoints).not.toHaveBeenCalled();
    });
});
