import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { cache as cacheManager } from '../cacheStore.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { InfluxService } from '../influx/influx.service.js';
import { OrganizationEntity } from '../users/entities/organization.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { KeyDto, ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(
        readonly usersService: UsersService,
        @Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService,
    ) {}

    static normalizeKeyId(keyId: string): string {
        if (!keyId) {
            return keyId;
        }
        return keyId.endsWith('@clients') ? keyId.slice(0, -'@clients'.length) : keyId;
    }

    static subjectForKey(clientId: string): string {
        return `${clientId}@clients`;
    }

    async findAll(businessID: string): Promise<ReadKeysResponse> {
        const claimedIds = await this.claimedClientIds(businessID);
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const clients = await this.listAllAuth0Clients(access_token);
        const data: KeyDto[] = clients
            .filter((client) => claimedIds.has(client.client_id))
            .map((client) => ({
                client_id: client.client_id,
                name: client.name,
                app_type: client.app_type,
                subject: KeysService.subjectForKey(client.client_id),
            }));
        return { message: 'Found keys', data };
    }

    async rotate(businessID: string, keyId: string): Promise<RotateKeyResponse> {
        const clientId = KeysService.normalizeKeyId(keyId);
        await this.assertKeyOwnedByAccount(businessID, clientId);
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const res = await fetch(
            `https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}/rotate-secret`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${access_token}`,
                    'cache-control': 'no-cache',
                },
            },
        );
        if (!res.ok) {
            KeysService.logger.error(`Failed to rotate secret for ${clientId}: ${res.status}`);
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        const jsonRes = await res.json();
        return {
            message: 'Rotated key',
            client_id: jsonRes.client_id || clientId,
            client_secret: jsonRes.client_secret,
            name: jsonRes.name,
        };
    }

    async retire(businessID: string, keyId: string): Promise<BasicResponseDTO> {
        const clientId = KeysService.normalizeKeyId(keyId);
        const owned = await this.assertKeyOwnedByAccount(businessID, clientId);
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${access_token}`,
                'cache-control': 'no-cache',
            },
        });
        if (!res.ok && res.status !== 204 && res.status !== 404) {
            KeysService.logger.error(`Failed to delete client ${clientId}: ${res.status}`);
            throw new NotFoundException(`Key ${clientId} was not found`);
        }

        const subject = KeysService.subjectForKey(clientId);
        const entity = new UserEntity({
            subject,
            businessID,
            environment: owned.environment,
            softDelete: 'deleted',
        });
        await this.InfluxService.loadPoints(
            `${process.env.STAGE}-config`,
            process.env.INFLUX_ORG,
            UserEntity.transformer(entity, this.InfluxService),
        );
        await cacheManager.del(subject);
        return { message: 'Deleted key' };
    }

    private async claimedClientIds(businessID: string): Promise<Set<string>> {
        const { data: users } = await this.usersService.findAllUsersForBusinessID({ businessID });
        const claimed = new Set<string>();
        for (const user of users || []) {
            if (user?.subject?.endsWith('@clients')) {
                claimed.add(KeysService.normalizeKeyId(user.subject));
            }
        }
        return claimed;
    }

    private async assertKeyOwnedByAccount(businessID: string, clientId: string): Promise<UserEntity> {
        const { data: users } = await this.usersService.findAllUsersForBusinessID({ businessID });
        const subject = KeysService.subjectForKey(clientId);
        const match = (users || []).find((user) => user.subject === subject || user.subject === clientId);
        if (!match) {
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        return match;
    }

    private async listAllAuth0Clients(accessToken: string): Promise<Array<any>> {
        const perPage = 100;
        let page = 0;
        const all: Array<any> = [];
        while (true) {
            const url = `https://auth.meteringco.example/api/v2/clients?include_totals=true&per_page=${perPage}&page=${page}&fields=client_secret&include_fields=false`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'cache-control': 'no-cache',
                },
            });
            if (!res.ok) {
                KeysService.logger.error(`Failed to list identity-provider clients: ${res.status}`);
                break;
            }
            const jsonRes = await res.json();
            const clients = Array.isArray(jsonRes) ? jsonRes : jsonRes.clients || [];
            all.push(...clients);
            const total = typeof jsonRes.total === 'number' ? jsonRes.total : all.length;
            if (all.length >= total || clients.length === 0) {
                break;
            }
            page += 1;
        }
        return all;
    }
}
