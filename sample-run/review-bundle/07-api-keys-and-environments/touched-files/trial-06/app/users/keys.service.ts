import { Injectable, Inject, Logger, forwardRef, NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { InfluxService } from '../influx/influx.service.js';
import { OrganizationEntity } from './entities/organization.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { cache as cacheManager } from '../cacheStore.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { ReadKeyDto, ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';

const CLIENTS_SUFFIX = '@clients';

type Auth0Client = {
    client_id?: string;
    name?: string;
    app_type?: string;
    client_secret?: string;
};

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(@Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService) {}

    /**
     * Subjects that belong to this account in the current environment and are
     * machine credentials (they sign in as <clientId>@clients). Human console
     * users and already-retired integrations are excluded by the store query.
     */
    private async machineSubjectsForAccount(businessID: string): Promise<UserEntity[]> {
        const { data } = await this.listUsersForBusiness(businessID);
        return data.filter((user) => user.subject && user.subject.endsWith(CLIENTS_SUFFIX));
    }

    private async listUsersForBusiness(businessID: string): Promise<{ data: UserEntity[] }> {
        const { readAllUsersForBusiness } = this.InfluxService;
        const results = await readAllUsersForBusiness(businessID);
        const entities = results.map((result) => UserEntity.dbModelToEntity([result]));
        return { data: entities };
    }

    private clientIdFromSubject(subject: string): string {
        return subject.endsWith(CLIENTS_SUFFIX) ? subject.slice(0, -CLIENTS_SUFFIX.length) : subject;
    }

    private subjectFromKeyId(keyId: string): string {
        return keyId.endsWith(CLIENTS_SUFFIX) ? keyId : `${keyId}${CLIENTS_SUFFIX}`;
    }

    /**
     * A request naming a credential the current account does not hold must be
     * refused and must leave that credential exactly as it was.
     */
    private async requireOwnedCredential({
        keyId,
        businessID,
    }: {
        keyId: string;
        businessID: string;
    }): Promise<UserEntity> {
        const subject = this.subjectFromKeyId(keyId);
        const users = await this.machineSubjectsForAccount(businessID);
        const owned = users.find((user) => user.subject === subject);
        if (!owned) {
            throw new NotFoundException(`Key ${keyId} was not found`);
        }
        return owned;
    }

    async findAll({ businessID }: { businessID: string }): Promise<ReadKeysResponse> {
        const users = await this.machineSubjectsForAccount(businessID);
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const data: ReadKeyDto[] = [];
        for (const user of users) {
            const clientId = this.clientIdFromSubject(user.subject);
            let name: string | undefined;
            try {
                const client = await this.getAuth0Client(clientId, access_token);
                name = client?.name;
            } catch (error) {
                KeysService.logger.warn(`Could not load identity-provider record for ${clientId}`);
            }
            data.push(
                new ReadKeyDto({
                    keyId: clientId,
                    client_id: clientId,
                    subject: user.subject,
                    name,
                }),
            );
        }
        return new ReadKeysResponse({ message: 'Found keys', data });
    }

    async rotate({ keyId, businessID }: { keyId: string; businessID: string }): Promise<RotateKeyResponse> {
        const owned = await this.requireOwnedCredential({ keyId, businessID });
        const clientId = this.clientIdFromSubject(owned.subject);
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const rotated = await this.rotateAuth0Secret(clientId, access_token);
        return new RotateKeyResponse({
            message: 'Rotated secret',
            client_id: rotated.client_id || clientId,
            client_secret: rotated.client_secret,
        });
    }

    async retire({ keyId, businessID }: { keyId: string; businessID: string }): Promise<BasicResponseDTO> {
        const owned = await this.requireOwnedCredential({ keyId, businessID });
        const clientId = this.clientIdFromSubject(owned.subject);
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        // Withdraw at the identity provider first so a caller still presenting
        // the credential is refused from that moment.
        await this.deleteAuth0Client(clientId, access_token);
        const retired = new UserEntity({
            subject: owned.subject,
            businessID: owned.businessID,
            environment: owned.environment,
            softDelete: 'deleted',
            ...(owned.accountExpiryDate ? { accountExpiryDate: owned.accountExpiryDate } : {}),
            ...(owned.temp !== undefined ? { temp: owned.temp } : {}),
        });
        await this.InfluxService.loadPoints(
            `${process.env.STAGE}-config`,
            process.env.INFLUX_ORG,
            UserEntity.transformer(retired, this.InfluxService),
        );
        await cacheManager.del(owned.subject);
        return { message: 'Key retired' };
    }

    private async getAuth0Client(clientId: string, accessToken: string): Promise<Auth0Client> {
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        const jsonRes = await res.json();
        if (!res.ok || jsonRes?.error || jsonRes?.statusCode) {
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        return jsonRes;
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
        const jsonRes = await res.json();
        if (!res.ok || jsonRes?.error || jsonRes?.statusCode) {
            KeysService.logger.error(`Failed to rotate secret for ${clientId}: ${JSON.stringify(jsonRes)}`);
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        return jsonRes;
    }

    private async deleteAuth0Client(clientId: string, accessToken: string): Promise<void> {
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            // Already withdrawn at the identity provider; still take it out of configuration.
            return;
        }
        if (!res.ok && res.status !== 204) {
            let body: unknown;
            try {
                body = await res.json();
            } catch (error) {
                body = { status: res.status };
            }
            KeysService.logger.error(`Failed to retire ${clientId}: ${JSON.stringify(body)}`);
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
    }
}
