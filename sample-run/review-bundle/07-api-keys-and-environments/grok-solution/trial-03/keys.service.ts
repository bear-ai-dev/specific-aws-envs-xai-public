import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { InfluxService } from '../influx/influx.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { KeyEntity } from './entities/key.entity.js';
import { KeyDto, ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { cache as cacheManager } from '../cacheStore.js';

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(@Inject(forwardRef(() => InfluxService)) readonly influxService: InfluxService) {}

    private async loadAccountBindings(businessID: string): Promise<UserEntity[]> {
        const { readAllUsersForBusiness } = this.influxService;
        const results = await readAllUsersForBusiness(businessID);
        return results.map((result) => UserEntity.dbModelToEntity([result]));
    }

    private machineBindingsForAccount(bindings: UserEntity[]): UserEntity[] {
        return bindings.filter((binding) => Boolean(KeyEntity.clientIdFromSubject(binding.subject)));
    }

    private bindingForKey(bindings: UserEntity[], keyId: string): UserEntity | undefined {
        const subject = KeyEntity.subjectForClient(keyId);
        return bindings.find((binding) => binding.subject === subject);
    }

    private async requireOwnedBinding(businessID: string, keyId: string): Promise<UserEntity> {
        const bindings = this.machineBindingsForAccount(await this.loadAccountBindings(businessID));
        const binding = this.bindingForKey(bindings, keyId);
        if (!binding) {
            throw new NotFoundException(`Key ${keyId} is not held by the current account`);
        }
        return binding;
    }

    async findAll({ businessID }: { businessID: string }): Promise<ReadKeysResponse> {
        const bindings = this.machineBindingsForAccount(await this.loadAccountBindings(businessID));
        const claimedIds = new Set(bindings.map((binding) => KeyEntity.clientIdFromSubject(binding.subject)));
        const clients = await KeyEntity.listClients();
        const data = clients
            .filter((client) => claimedIds.has(client.client_id))
            .map(
                (client) =>
                    new KeyDto({
                        keyId: client.client_id,
                        name: client.name,
                        appType: client.app_type,
                    }),
            );
        return new ReadKeysResponse({ message: 'Found keys', data });
    }

    async rotate({ businessID, keyId }: { businessID: string; keyId: string }): Promise<RotateKeyResponse> {
        await this.requireOwnedBinding(businessID, keyId);
        const client = await KeyEntity.getClient(keyId);
        if (!client) {
            throw new NotFoundException(`Key ${keyId} is not held by the current account`);
        }
        const rotated = await KeyEntity.rotateSecret(keyId);
        return new RotateKeyResponse({
            message: 'Rotated key secret',
            data: new KeyDto({
                keyId: rotated.client_id,
                name: rotated.name,
                appType: rotated.app_type,
                clientSecret: rotated.client_secret,
            }),
        });
    }

    async retire({ businessID, keyId }: { businessID: string; keyId: string }): Promise<BasicResponseDTO> {
        const binding = await this.requireOwnedBinding(businessID, keyId);
        await KeyEntity.deleteClient(keyId);
        const retired = new UserEntity({
            subject: binding.subject,
            businessID: binding.businessID,
            accountExpiryDate: binding.accountExpiryDate,
            temp: binding.temp,
            environment: binding.environment,
            softDelete: 'deleted',
        });
        await this.influxService.loadPoints(
            `${process.env.STAGE}-config`,
            process.env.INFLUX_ORG,
            UserEntity.transformer(retired, this.influxService),
        );
        await cacheManager.del(binding.subject);
        KeysService.logger.debug(`Retired key ${keyId} from account ${businessID}`);
        return { message: 'Deleted key' };
    }
}
