import { Logger, NotFoundException } from '@nestjs/common';
import { fetch } from 'cross-fetch';
import { OrganizationEntity } from '../../users/entities/organization.entity.js';
import { cache as cacheManager } from '../../cacheStore.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuditScope } from '../../audit/entities/audit.interface.js';

export type Auth0Client = {
    client_id: string;
    name: string;
    app_type: string;
    client_secret?: string;
    tenant?: string;
    grant_types?: string[];
};

export class KeyEntity {
    private static readonly logger = new Logger(KeyEntity.name);

    public static subjectToClientId(subject: string): string {
        if (subject?.endsWith('@clients')) {
            return subject.replace(/@clients$/, '');
        }
        return subject;
    }

    public static clientIdToSubject(clientId: string): string {
        if (clientId?.endsWith('@clients')) {
            return clientId;
        }
        return `${clientId}@clients`;
    }

    public static async listClients(): Promise<Auth0Client[]> {
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const res = await fetch('https://auth.meteringco.example/api/v2/clients', {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${access_token}`,
                'cache-control': 'no-cache',
            },
        });
        if (!res.ok) {
            const body = await res.text();
            KeyEntity.logger.error(`Failed to list clients: ${res.status} ${body}`);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error listing auth0 clients',
                data: [{ status: res.status, body }],
            });
            throw new Error('Error listing auth0 clients');
        }
        return res.json();
    }

    public static async getClient(clientId: string): Promise<Auth0Client | null> {
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${access_token}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            return null;
        }
        if (!res.ok) {
            const body = await res.text();
            KeyEntity.logger.error(`Failed to get client ${clientId}: ${res.status} ${body}`);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error reading auth0 client',
                data: [{ status: res.status, body, clientId }],
            });
            throw new Error('Error reading auth0 client');
        }
        return res.json();
    }

    public static async rotateSecret(clientId: string): Promise<Auth0Client> {
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
        if (res.status === 404) {
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        if (!res.ok) {
            const body = await res.text();
            KeyEntity.logger.error(`Failed to rotate secret for ${clientId}: ${res.status} ${body}`);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error rotating auth0 client secret',
                data: [{ status: res.status, body, clientId }],
            });
            throw new Error('Error rotating auth0 client secret');
        }
        return res.json();
    }

    public static async deleteClient(clientId: string): Promise<void> {
        const { access_token } = await OrganizationEntity.getAuth0ManagementToken(cacheManager);
        const res = await fetch(`https://auth.meteringco.example/api/v2/clients/${encodeURIComponent(clientId)}`, {
            method: 'DELETE',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${access_token}`,
                'cache-control': 'no-cache',
            },
        });
        if (res.status === 404) {
            throw new NotFoundException(`Key ${clientId} was not found`);
        }
        if (!res.ok && res.status !== 204) {
            const body = await res.text();
            KeyEntity.logger.error(`Failed to delete client ${clientId}: ${res.status} ${body}`);
            AuditService.publishEvent({
                topic: AuditScope.ERROR,
                message: 'Error deleting auth0 client',
                data: [{ status: res.status, body, clientId }],
            });
            throw new Error('Error deleting auth0 client');
        }
    }
}
