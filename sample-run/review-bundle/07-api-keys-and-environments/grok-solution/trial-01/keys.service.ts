import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { cache as cacheManager } from '../cacheStore.js';
import { InfluxService } from '../influx/influx.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { KeyDto, ReadKeysResponse, RotateKeyResponse } from './dto/read-keys.dto.js';
import { KeyEntity } from './entities/key.entity.js';

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(
        @Inject(forwardRef(() => UsersService)) readonly usersService: UsersService,
        @Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService,
    ) {}

    async findAll({ businessID }: { businessID: string }): Promise<ReadKeysResponse> {
        const owned = await this.ownedMachineCredentials(businessID);
        const clients = await KeyEntity.listClients();
        const clientsById = new Map(clients.map((client) => [client.client_id, client]));

        const data = owned
            .map((user) => {
                const keyId = KeyEntity.toClientId(user.subject);
                const client = clientsById.get(keyId);
                if (!client) {
                    return null;
                }
                return new KeyDto({ keyId, name: client.name });
            })
            .filter((key): key is KeyDto => key !== null);

        return new ReadKeysResponse({ message: 'Found keys', data });
    }

    async rotate({ businessID, keyId }: { businessID: string; keyId: string }): Promise<RotateKeyResponse> {
        await this.assertOwnedByAccount(businessID, keyId);
        const rotated = await KeyEntity.rotateSecret(keyId);
        return new RotateKeyResponse({
            message: 'Secret rotated successfully',
            keyId: KeyEntity.toClientId(keyId),
            clientSecret: rotated.client_secret,
        });
    }

    async retire({ businessID, keyId }: { businessID: string; keyId: string }): Promise<BasicResponseDTO> {
        const owned = await this.assertOwnedByAccount(businessID, keyId);
        await KeyEntity.deleteClient(keyId);

        const retired = new UserEntity({
            subject: owned.subject,
            businessID: owned.businessID,
            environment: owned.environment,
            accountExpiryDate: owned.accountExpiryDate,
            temp: owned.temp,
            softDelete: 'deleted',
        });
        const points = UserEntity.transformer(retired, this.influxService);
        await this.influxService.loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, points);
        await cacheManager.del(owned.subject);

        KeysService.logger.log(`Retired credential ${owned.subject} from account ${businessID}`);
        return { message: 'Key deleted successfully' };
    }

    private async ownedMachineCredentials(businessID: string): Promise<UserEntity[]> {
        const { data } = await this.usersService.findAllUsersForBusinessID({ businessID });
        return data.filter((user) => user.subject?.endsWith(KeyEntity.SUBJECT_SUFFIX));
    }

    private async assertOwnedByAccount(businessID: string, keyId: string): Promise<UserEntity> {
        const subject = KeyEntity.toSubject(keyId);
        const owned = await this.ownedMachineCredentials(businessID);
        const match = owned.find((user) => user.subject === subject);
        if (!match) {
            throw new NotFoundException(`Key ${KeyEntity.toClientId(keyId)} was not found`);
        }
        return match;
    }
}
