import { Logger } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { AuditService } from '../../audit/audit.service.js';
import { AuditScope } from '../../audit/entities/audit.interface.js';
import { OrganizationEntity } from '../../users/entities/organization.entity.js';
import { cache as cacheManager } from '../../cacheStore.js';

export type Auth0Client = {
    client_id: string;
    name: string;
    app_type: string;
    tenant?: string;
    grant_types?: string[];
    client_secret?: string;
};

export class KeyEntity {
    private static readonly logger = new Logger(KeyEntity.name);

    public static subjectForClient(clientId: string): string {
        return `${clientId}@clients`;
    }

    public static clientIdFromSubject(subject: string): string | undefined {
        if (!subject) {
            return undefined;
        }
        if (subject.endsWith('@clients')) {
            return subject.slice(0, -'@clients'.length);
        }
        return undefined;
    }

    public static async getManagementToken(): Promise<string> {
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        return access_token;
    }

    public static async listClients(): Promise<Auth0Client[]> {
        const accessToken = await KeyEntity.getManagementToken();
        const res = await fetch('https://auth.meteringco.example/api/v2/clients', {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        const jsonRes = await res.json();
        if (!res.ok) {
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error listing auth0 clients',
                data: [jsonRes],
            });
            throw new Error('Error listing auth0 clients');
        }
        if (Array.isArray(jsonRes)) {
            return jsonRes;
        }
        if (Array.isArray(jsonRes?.clients)) {
            return jsonRes.clients;
        }
        return [];
    }

    public static async getClient(clientId: string): Promise<Auth0Client | undefined> {
        const accessToken = await KeyEntity.getManagementToken();
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            return undefined;
        }
        const jsonRes = await res.json();
        if (!res.ok) {
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error reading auth0 client',
                data: [jsonRes],
            });
            throw new Error('Error reading auth0 client');
        }
        return jsonRes;
    }

    public static async rotateSecret(clientId: string): Promise<Auth0Client> {
        const accessToken = await KeyEntity.getManagementToken();
        const res = await fetch(
            `https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}/rotate-secret`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                    'cache-control': 'no-cache',
                },
                body: JSON.stringify({}),
            },
        );
        const jsonRes = await res.json();
        if (!res.ok) {
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error rotating auth0 client secret',
                data: [jsonRes],
            });
            throw new Error('Error rotating auth0 client secret');
        }
        KeyEntity.logger.debug(`Rotated secret for client ${clientId}`);
        return jsonRes;
    }

    public static async deleteClient(clientId: string): Promise<void> {
        const accessToken = await KeyEntity.getManagementToken();
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            return;
        }
        if (!res.ok) {
            const body = await res.text();
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error deleting auth0 client',
                data: [body],
            });
            throw new Error('Error deleting auth0 client');
        }
        KeyEntity.logger.debug(`Deleted client ${clientId}`);
    }
}
