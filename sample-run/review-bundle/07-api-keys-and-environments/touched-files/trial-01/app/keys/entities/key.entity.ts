import { Logger, NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { cache as cacheManager } from '../../cacheStore.js';
import { OrganizationEntity } from '../../users/entities/organization.entity.js';

export class Auth0Client {
    public client_id: string;
    public name: string;
    public app_type?: string;
    public client_secret?: string;
}

export class KeyEntity {
    private static readonly logger = new Logger(KeyEntity.name);
    public static readonly SUBJECT_SUFFIX = '@clients';

    public static toClientId(keyId: string): string {
        return keyId.endsWith(KeyEntity.SUBJECT_SUFFIX) ? keyId.slice(0, -KeyEntity.SUBJECT_SUFFIX.length) : keyId;
    }

    public static toSubject(keyId: string): string {
        return keyId.endsWith(KeyEntity.SUBJECT_SUFFIX) ? keyId : `${keyId}${KeyEntity.SUBJECT_SUFFIX}`;
    }

    public static async getManagementToken(): Promise<string> {
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        return access_token;
    }

    public static async listClients(): Promise<Auth0Client[]> {
        const accessToken = await KeyEntity.getManagementToken();
        const clients: Auth0Client[] = [];
        let page = 0;
        const perPage = 50;

        while (true) {
            const url =
                `https://auth.meteringco.example/api/v2/clients` +
                `?page=${page}&per_page=${perPage}&include_totals=true&include_fields=false&fields=client_secret`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'cache-control': 'no-cache',
                },
            });
            if (!res.ok) {
                KeyEntity.logger.error(`Failed to list identity provider clients: ${res.status}`);
                throw new Error(`Failed to list identity provider clients: ${res.status}`);
            }
            const json = await res.json();
            const batch: Auth0Client[] = Array.isArray(json) ? json : json.clients || [];
            clients.push(...batch);
            const total = Array.isArray(json) ? batch.length : json.total;
            if (!total || clients.length >= total || batch.length === 0) {
                break;
            }
            page += 1;
        }

        return clients;
    }

    public static async getClient(keyId: string): Promise<Auth0Client> {
        const accessToken = await KeyEntity.getManagementToken();
        const clientId = KeyEntity.toClientId(keyId);
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        if (!res.ok) {
            KeyEntity.logger.error(`Failed to read identity provider client ${clientId}: ${res.status}`);
            throw new Error(`Failed to read identity provider client ${clientId}: ${res.status}`);
        }
        return res.json();
    }

    public static async rotateSecret(keyId: string): Promise<Auth0Client> {
        const accessToken = await KeyEntity.getManagementToken();
        const clientId = KeyEntity.toClientId(keyId);
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
        if (res.status === 404) {
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        if (!res.ok) {
            KeyEntity.logger.error(`Failed to rotate secret for ${clientId}: ${res.status}`);
            throw new Error(`Failed to rotate secret for ${clientId}: ${res.status}`);
        }
        return res.json();
    }

    public static async deleteClient(keyId: string): Promise<void> {
        const accessToken = await KeyEntity.getManagementToken();
        const clientId = KeyEntity.toClientId(keyId);
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        if (!res.ok && res.status !== 204) {
            KeyEntity.logger.error(`Failed to delete identity provider client ${clientId}: ${res.status}`);
            throw new Error(`Failed to delete identity provider client ${clientId}: ${res.status}`);
        }
    }
}
