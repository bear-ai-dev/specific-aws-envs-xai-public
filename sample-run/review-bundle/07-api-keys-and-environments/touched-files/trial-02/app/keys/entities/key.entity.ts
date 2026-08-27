import { Logger, NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { cache as cacheManager } from '../../cacheStore.js';
import { OrganizationEntity } from '../../users/entities/organization.entity.js';

export type Auth0Client = {
    client_id: string;
    name?: string;
    app_type?: string;
    client_secret?: string;
};

export class KeyEntity {
    private static readonly logger = new Logger(KeyEntity.name);

    public static toSubject(keyId: string): string {
        return keyId.endsWith('@clients') ? keyId : `${keyId}@clients`;
    }

    public static toClientId(keyId: string): string {
        return keyId.endsWith('@clients') ? keyId.slice(0, -'@clients'.length) : keyId;
    }

    public static isMachineCredentialSubject(subject: string): boolean {
        return typeof subject === 'string' && subject.endsWith('@clients');
    }

    public static async getManagementToken(): Promise<string> {
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        return access_token;
    }

    public static async listClients(accessToken: string): Promise<Auth0Client[]> {
        const clients: Auth0Client[] = [];
        let page = 0;
        const perPage = 100;
        // Paginate and never ask the identity provider to return secrets.
        while (true) {
            const url =
                `https://auth.meteringco.example/api/v2/clients` +
                `?per_page=${perPage}&page=${page}&include_totals=true` +
                `&include_fields=false&fields=client_secret`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'cache-control': 'no-cache',
                },
            });
            if (!res.ok) {
                const body = await res.text();
                KeyEntity.logger.error(`Failed to list clients: ${res.status} ${body}`);
                throw new Error('Failed to list identity provider clients');
            }
            const json = await res.json();
            const pageClients: Auth0Client[] = Array.isArray(json) ? json : json.clients || [];
            clients.push(...pageClients);
            const total = Array.isArray(json) ? pageClients.length : json.total;
            if (Array.isArray(json) || clients.length >= total || pageClients.length < perPage) {
                break;
            }
            page += 1;
        }
        return clients;
    }

    public static async getClient(clientId: string, accessToken: string): Promise<Auth0Client> {
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            throw new NotFoundException('Key was not found');
        }
        if (!res.ok) {
            const body = await res.text();
            KeyEntity.logger.error(`Failed to get client ${clientId}: ${res.status} ${body}`);
            throw new Error('Failed to get identity provider client');
        }
        return res.json();
    }

    public static async rotateSecret(clientId: string, accessToken: string): Promise<Auth0Client> {
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
            throw new NotFoundException('Key was not found');
        }
        if (!res.ok) {
            const body = await res.text();
            KeyEntity.logger.error(`Failed to rotate client ${clientId}: ${res.status} ${body}`);
            throw new Error('Failed to rotate identity provider client secret');
        }
        return res.json();
    }

    public static async deleteClient(clientId: string, accessToken: string): Promise<void> {
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            // Already withdrawn at the identity provider; configuration is still the caller's to retire.
            return;
        }
        if (!res.ok && res.status !== 204) {
            const body = await res.text();
            KeyEntity.logger.error(`Failed to delete client ${clientId}: ${res.status} ${body}`);
            throw new Error('Failed to delete identity provider client');
        }
    }
}
