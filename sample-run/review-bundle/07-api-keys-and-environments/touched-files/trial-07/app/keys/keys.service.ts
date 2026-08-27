import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { cache as cacheManager } from '../cacheStore.js';
import { OrganizationEntity } from '../users/entities/organization.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { KeyResponseData, ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';
import { Auth0Client } from './entities/key.entity.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { InfluxService } from '../influx/influx.service.js';

const MACHINE_SUBJECT_SUFFIX = '@clients';

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(
        readonly usersService: UsersService,
        readonly influxService: InfluxService,
    ) {}

    private keyIdToSubject(keyId: string): string {
        return `${keyId}${MACHINE_SUBJECT_SUFFIX}`;
    }

    private subjectToKeyId(subject: string): string {
        return subject.endsWith(MACHINE_SUBJECT_SUFFIX) ? subject.slice(0, -MACHINE_SUBJECT_SUFFIX.length) : subject;
    }

    private isMachineSubject(subject: string): boolean {
        return subject?.endsWith(MACHINE_SUBJECT_SUFFIX);
    }

    private async getManagementToken(): Promise<string> {
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        return access_token;
    }

    private async listAuth0Clients(accessToken: string): Promise<Auth0Client[]> {
        const res = await fetch('https://auth.meteringco.example/api/v2/clients', {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (!res.ok) {
            const body = await res.text();
            KeysService.logger.error(`Failed to list identity provider clients: ${res.status} ${body}`);
            throw new BadRequestException('Failed to list credentials from identity provider');
        }
        return res.json();
    }

    private async rotateAuth0ClientSecret(keyId: string, accessToken: string): Promise<Auth0Client> {
        const res = await fetch(
            `https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(keyId)}/rotate-secret`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'cache-control': 'no-cache',
                },
            },
        );
        if (res.status === 404) {
            throw new NotFoundException(`Key ${keyId} was not found`);
        }
        if (!res.ok) {
            const body = await res.text();
            KeysService.logger.error(`Failed to rotate secret for ${keyId}: ${res.status} ${body}`);
            throw new BadRequestException('Failed to rotate credential secret');
        }
        return res.json();
    }

    private async deleteAuth0Client(keyId: string, accessToken: string): Promise<void> {
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(keyId)}`, {
            method: 'DELETE',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            throw new NotFoundException(`Key ${keyId} was not found`);
        }
        if (!res.ok && res.status !== 204) {
            const body = await res.text();
            KeysService.logger.error(`Failed to retire credential ${keyId}: ${res.status} ${body}`);
            throw new BadRequestException('Failed to retire credential at identity provider');
        }
    }

    private async getAccountKeys(businessID: string): Promise<UserEntity[]> {
        const { data } = await this.usersService.findAllUsersForBusinessID({ businessID });
        return (data || []).filter((user) => this.isMachineSubject(user.subject) && user.softDelete !== 'deleted');
    }

    private async getOwnedKey(businessID: string, keyId: string): Promise<UserEntity> {
        const subject = this.keyIdToSubject(keyId);
        const keys = await this.getAccountKeys(businessID);
        const owned = keys.find((user) => user.subject === subject);
        if (!owned) {
            throw new NotFoundException(`Key ${keyId} was not found`);
        }
        return owned;
    }

    async findAll({ businessID }: { businessID: string }): Promise<ReadKeysResponse> {
        const keys = await this.getAccountKeys(businessID);
        let clientsById = new Map<string, Auth0Client>();
        try {
            const accessToken = await this.getManagementToken();
            const clients = await this.listAuth0Clients(accessToken);
            clientsById = new Map(clients.map((client) => [client.client_id, client]));
        } catch (error) {
            KeysService.logger.warn(`Unable to enrich keys with identity provider names: ${error}`);
        }

        const data = keys.map((user) => {
            const keyId = this.subjectToKeyId(user.subject);
            const client = clientsById.get(keyId);
            return new KeyResponseData({
                keyId,
                name: client?.name,
            });
        });

        return { message: 'Found keys', data };
    }

    async rotate({ businessID, keyId }: { businessID: string; keyId: string }): Promise<RotateKeyResponse> {
        await this.getOwnedKey(businessID, keyId);
        const accessToken = await this.getManagementToken();
        const rotated = await this.rotateAuth0ClientSecret(keyId, accessToken);
        return {
            message: 'Rotated key secret',
            data: new KeyResponseData({
                keyId: rotated.client_id || keyId,
                name: rotated.name,
                clientSecret: rotated.client_secret,
            }),
        };
    }

    async retire({ businessID, keyId }: { businessID: string; keyId: string }): Promise<BasicResponseDTO> {
        const owned = await this.getOwnedKey(businessID, keyId);
        const accessToken = await this.getManagementToken();
        await this.deleteAuth0Client(keyId, accessToken);

        const retired = new UserEntity({
            subject: owned.subject,
            businessID: owned.businessID,
            accountExpiryDate: owned.accountExpiryDate,
            temp: owned.temp,
            environment: owned.environment,
            softDelete: 'deleted',
        });
        const points = UserEntity.transformer(retired, this.influxService);
        await this.influxService.loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, points);
        await cacheManager.del(owned.subject);

        return { message: 'Deleted key' };
    }
}
