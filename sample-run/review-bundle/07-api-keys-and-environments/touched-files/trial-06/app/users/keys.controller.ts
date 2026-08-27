import { Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { KeysService } from './keys.service.js';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
import { UserPermissions } from './user.permissions.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';

/**
 * Console API key screen: list, rotate and retire machine credentials
 * belonging to the account the caller is currently in.
 */
@ApiBearerAuth('bearer')
@Controller('keys')
@ApiTags('Keys')
export class KeysController {
    constructor(private readonly keysService: KeysService) {}

    /**
     * List the machine credentials the current account holds in the current environment
     */
    @ApiOkResponse({
        status: 200,
        description: 'Keys for the current account and environment',
        type: ReadKeysResponse,
    })
    @ApiOperation({ operationId: 'Find all keys in the account' })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSREAD]))
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { businessID } = request.user;
        return this.keysService.findAll({ businessID });
    }

    /**
     * Replace the secret on one credential. Every other credential is left untouched.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Rotated secret',
        type: RotateKeyResponse,
    })
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @Put(':keyId')
    rotate(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { businessID } = request.user;
        return this.keysService.rotate({ keyId, businessID });
    }

    /**
     * Retire a credential: withdraw it at the identity provider and remove the
     * account it signs in as from the tenant's configuration.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Key retired',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Delete a user key' })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @Delete(':keyId')
    retire(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { businessID } = request.user;
        return this.keysService.retire({ keyId, businessID });
    }
}
