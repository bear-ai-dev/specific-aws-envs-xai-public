import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InfluxService } from '../influx/influx.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { cache as cacheManager } from '../cacheStore.js';
import { ReadKeysResponseDto, RotateKeyResponseDto } from './dto/read-key.dto.js';
import { KeyEntity } from './entities/key.entity.js';

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(readonly InfluxService: InfluxService) {}

    /**
     * Machine credentials claimed by this account in this environment.
     * Human console sign-ins and already-retired integrations are not listed.
     */
    async findAll({ businessID }: { businessID: string }): Promise<ReadKeysResponseDto> {
        const { readAllUsersForBusiness } = this.InfluxService;
        const results = await readAllUsersForBusiness(businessID);
        const claimed = results
            .map((result) => UserEntity.dbModelToEntity([result]))
            .filter((entity) => entity.subject?.endsWith('@clients'));

        if (claimed.length === 0) {
            return { message: 'Found keys', data: [] };
        }

        const clients = await KeyEntity.listClients();
        const byId = new Map(clients.map((client) => [client.client_id, client]));
        const data = claimed
            .map((entity) => {
                const clientId = KeyEntity.subjectToClientId(entity.subject);
                const client = byId.get(clientId);
                if (!client) {
                    return null;
                }
                return {
                    client_id: client.client_id,
                    name: client.name,
                    app_type: client.app_type,
                };
            })
            .filter((key): key is { client_id: string; name: string; app_type: string } => Boolean(key));

        return { message: 'Found keys', data };
    }

    /**
     * Replace the secret on one claimed credential. Leaves every other credential untouched.
     */
    async rotate({ keyId, businessID }: { keyId: string; businessID: string }): Promise<RotateKeyResponseDto> {
        await this.assertOwnedLiveCredential({ keyId, businessID });
        const rotated = await KeyEntity.rotateSecret(keyId);
        return {
            message: 'Rotated key secret',
            client_id: rotated.client_id,
            client_secret: rotated.client_secret,
        };
    }

    /**
     * Withdraw the credential at the identity provider and take the account it
     * signs in as out of the tenant's configuration so a caller still presenting
     * it is refused from that moment.
     */
    async retire({ keyId, businessID }: { keyId: string; businessID: string }): Promise<BasicResponseDTO> {
        const claimed = await this.assertOwnedLiveCredential({ keyId, businessID });
        await KeyEntity.deleteClient(keyId);
        const { loadPoints } = this.InfluxService;
        claimed.softDelete = 'deleted';
        const points = UserEntity.transformer(claimed, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, points);
        const subject = KeyEntity.clientIdToSubject(keyId);
        await Promise.all([cacheManager.del(subject), cacheManager.del(`${subject}:${claimed.environment}`)]);
        return { message: 'Deleted key' };
    }

    /**
     * A credential belongs to exactly one environment of one tenant. Naming one
     * the current account does not hold is refused and the credential is left
     * exactly as it was.
     */
    private async assertOwnedLiveCredential({
        keyId,
        businessID,
    }: {
        keyId: string;
        businessID: string;
    }): Promise<UserEntity> {
        const subject = KeyEntity.clientIdToSubject(keyId);
        const { readAllUsersForBusiness } = this.InfluxService;
        const results = await readAllUsersForBusiness(businessID);
        const claimed = results
            .map((result) => UserEntity.dbModelToEntity([result]))
            .find((entity) => entity.subject === subject);

        if (!claimed) {
            // Distinguish "exists at the identity provider but is not claimed
            // here" from "does not exist" only enough to refuse the act; either
            // way the credential must be left exactly as it was.
            throw new NotFoundException(`Key ${keyId} was not found`);
        }

        if (!claimed.subject?.endsWith('@clients')) {
            throw new ForbiddenException(`Key ${keyId} is not a machine credential`);
        }

        return claimed;
    }
}
