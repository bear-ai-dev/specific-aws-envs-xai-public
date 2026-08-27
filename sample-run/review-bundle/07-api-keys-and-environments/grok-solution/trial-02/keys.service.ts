import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { InfluxService } from '../influx/influx.service.js';
import { EnvironmentService, UsersService } from '../users/users.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { KeyEntity } from './entities/key.entity.js';
import { KeyDto, ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';

@Injectable()
export class KeysService {
    private static readonly logger = new Logger(KeysService.name);

    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => UsersService)) readonly usersService: UsersService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentService: EnvironmentService,
    ) {}

    async findAll({ subject, businessID }: { subject: string; businessID: string }): Promise<ReadKeysResponse> {
        const { environment } = await this.environmentService.getCurrentEnvironment(subject);
        const accountUsers = await this.usersService.findAllUsersForBusinessID({ businessID });
        const machineUsers = (accountUsers.data || []).filter(
            (user) => KeyEntity.isMachineCredentialSubject(user.subject) && user.environment === environment,
        );
        const claimedSubjects = new Set(machineUsers.map((user) => user.subject));

        const accessToken = await KeyEntity.getManagementToken();
        const clients = await KeyEntity.listClients(accessToken);
        const clientsById = new Map(clients.map((client) => [client.client_id, client]));

        const data: KeyDto[] = [];
        for (const user of machineUsers) {
            const clientId = KeyEntity.toClientId(user.subject);
            const client = clientsById.get(clientId);
            if (!client) {
                continue;
            }
            data.push({
                client_id: client.client_id,
                name: client.name,
                app_type: client.app_type,
                subject: user.subject,
            });
        }

        KeysService.logger.debug(
            `Listed ${data.length} keys for ${businessID} in ${environment}; claimed ${claimedSubjects.size}`,
        );
        return { message: 'Found keys', data };
    }

    async rotate({
        keyId,
        subject,
        businessID,
    }: {
        keyId: string;
        subject: string;
        businessID: string;
    }): Promise<RotateKeyResponse> {
        await this.assertKeyBelongsToCurrentAccount({ keyId, subject, businessID });
        const clientId = KeyEntity.toClientId(keyId);
        const accessToken = await KeyEntity.getManagementToken();
        const rotated = await KeyEntity.rotateSecret(clientId, accessToken);
        if (!rotated?.client_secret) {
            throw new Error('Identity provider did not return a rotated secret');
        }
        return {
            message: 'Rotated key secret',
            client_id: rotated.client_id || clientId,
            client_secret: rotated.client_secret,
        };
    }

    async retire({
        keyId,
        subject,
        businessID,
    }: {
        keyId: string;
        subject: string;
        businessID: string;
    }): Promise<BasicResponseDTO> {
        const owned = await this.assertKeyBelongsToCurrentAccount({ keyId, subject, businessID });
        const clientId = KeyEntity.toClientId(keyId);
        const accessToken = await KeyEntity.getManagementToken();
        await KeyEntity.deleteClient(clientId, accessToken);
        const retired = new UserEntity({
            subject: owned.subject,
            businessID: owned.businessID,
            environment: owned.environment,
            accountExpiryDate: owned.accountExpiryDate,
            temp: owned.temp,
            softDelete: 'deleted',
        });
        const points = UserEntity.transformer(retired, this.InfluxService);
        await this.InfluxService.loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, points);
        return { message: 'Deleted key' };
    }

    private async assertKeyBelongsToCurrentAccount({
        keyId,
        subject,
        businessID,
    }: {
        keyId: string;
        subject: string;
        businessID: string;
    }): Promise<UserEntity> {
        const { environment } = await this.environmentService.getCurrentEnvironment(subject);
        const keySubject = KeyEntity.toSubject(keyId);
        const accountUsers = await this.usersService.findAllUsersForBusinessID({ businessID });
        const owned = (accountUsers.data || []).find(
            (user) => user.subject === keySubject && user.environment === environment,
        );
        if (!owned) {
            throw new NotFoundException('Key was not found');
        }
        return owned;
    }
}
