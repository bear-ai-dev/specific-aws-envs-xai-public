import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { OrganizationEntity } from '../users/entities/organization.entity.js';
import { cache as cacheManager } from '../cacheStore.js';
import { UsersService } from '../users/users.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { Environment } from '../users/dto/Environment.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { KeyDto, ReadKeysResponseDto, RotateKeyResponseDto } from './dto/read-key.dto.js';

const CLIENTS_SUBJECT_SUFFIX = '@clients';

type Auth0Client = {
    client_id?: string;
    name?: string;
    client_secret?: string;
    app_type?: string;
};

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(private readonly usersService: UsersService) {}

    static toClientId(keyId: string): string {
        if (keyId?.endsWith(CLIENTS_SUBJECT_SUFFIX)) {
            return keyId.slice(0, -CLIENTS_SUBJECT_SUFFIX.length);
        }
        return keyId;
    }

    static toSubject(keyId: string): string {
        if (keyId?.endsWith(CLIENTS_SUBJECT_SUFFIX)) {
            return keyId;
        }
        return `${keyId}${CLIENTS_SUBJECT_SUFFIX}`;
    }

    static isMachineSubject(subject: string): boolean {
        return typeof subject === 'string' && subject.endsWith(CLIENTS_SUBJECT_SUFFIX);
    }

    async findAll({ businessID }: { businessID: string }): Promise<ReadKeysResponseDto> {
        const { data: users } = await this.usersService.findAllUsersForBusinessID({ businessID });
        const machineUsers = (users || []).filter((user) => KeysService.isMachineSubject(user.subject));
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);

        const keys = await Promise.all(
            machineUsers.map(async (user) => {
                const clientId = KeysService.toClientId(user.subject);
                const client = await this.getAuth0Client(clientId, access_token);
                return {
                    keyId: clientId,
                    clientId,
                    name: client?.name || clientId,
                } as KeyDto;
            }),
        );

        return { message: 'Found keys', data: keys };
    }

    async rotate({
        keyId,
        businessID,
    }: {
        keyId: string;
        businessID: string;
        environment?: Environment;
    }): Promise<RotateKeyResponseDto> {
        const clientId = KeysService.toClientId(keyId);
        await this.assertHeldByAccount({ keyId: clientId, businessID });

        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const client = await this.rotateAuth0Secret(clientId, access_token);
        if (!client?.client_secret) {
            throw new NotFoundException(`Key was not found`);
        }

        return {
            message: 'Rotated secret',
            data: [
                {
                    keyId: clientId,
                    clientId,
                    name: client.name || clientId,
                    clientSecret: client.client_secret,
                },
            ],
        };
    }

    async retire({
        keyId,
        businessID,
    }: {
        keyId: string;
        businessID: string;
        environment?: Environment;
    }): Promise<BasicResponseDTO> {
        const clientId = KeysService.toClientId(keyId);
        const held = await this.assertHeldByAccount({ keyId: clientId, businessID });

        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        await this.deleteAuth0Client(clientId, access_token);
        await this.usersService.retireMachineCredential({
            subject: held.subject,
            businessID: held.businessID,
            environment: held.environment,
        });

        return { message: 'Deleted key' };
    }

    private async assertHeldByAccount({
        keyId,
        businessID,
    }: {
        keyId: string;
        businessID: string;
    }): Promise<UserEntity> {
        const subject = KeysService.toSubject(keyId);
        const { data: users } = await this.usersService.findAllUsersForBusinessID({ businessID });
        const held = (users || []).find(
            (user) => user.subject === subject && KeysService.isMachineSubject(user.subject),
        );
        if (!held) {
            throw new NotFoundException(`Key was not found`);
        }
        return held;
    }

    private async getAuth0Client(clientId: string, accessToken: string): Promise<Auth0Client | null> {
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (!res.ok) {
            KeysService.logger.warn(`Failed to read auth0 client ${clientId}: ${res.status}`);
            return null;
        }
        return (await res.json()) as Auth0Client;
    }

    private async rotateAuth0Secret(clientId: string, accessToken: string): Promise<Auth0Client> {
        const res = await fetch(
            `https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}/rotate-secret`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'cache-control': 'no-cache',
                },
            },
        );
        if (!res.ok) {
            KeysService.logger.warn(`Failed to rotate auth0 client ${clientId}: ${res.status}`);
            throw new NotFoundException(`Key was not found`);
        }
        return (await res.json()) as Auth0Client;
    }

    private async deleteAuth0Client(clientId: string, accessToken: string): Promise<void> {
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (!res.ok && res.status !== 204) {
            KeysService.logger.warn(`Failed to delete auth0 client ${clientId}: ${res.status}`);
            throw new NotFoundException(`Key was not found`);
        }
    }
}
