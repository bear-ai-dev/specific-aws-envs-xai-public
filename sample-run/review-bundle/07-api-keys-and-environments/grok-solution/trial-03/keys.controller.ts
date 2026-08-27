import { Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthorizedRequest } from '../authz/jwt-local.gaurd.js';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
import { UserPermissions } from '../users/user.permissions.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { KeysService } from './keys.service.js';
import { ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';

@ApiBearerAuth('bearer')
@Controller('keys')
@ApiTags('Keys')
export class KeysController {
    constructor(private readonly keysService: KeysService) {}

    /**
     * List the machine credentials the current account holds in the environment
     * the caller is currently in.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Returned keys for the current account',
        type: ReadKeysResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSREAD]))
    @UseGuards(AuthGuard('jwt'))
    @Get()
    @ApiOperation({ operationId: 'Find all keys in the account' })
    findAll(@Req() request: AuthorizedRequest) {
        const { businessID } = request.user;
        return this.keysService.findAll({ businessID });
    }

    /**
     * Replace the secret on a single credential. Every other credential is left
     * untouched.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Rotated the secret for the named key',
        type: RotateKeyResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @Put(':keyId')
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    rotate(@Param('keyId') keyId: string, @Req() request: AuthorizedRequest) {
        const { businessID } = request.user;
        return this.keysService.rotate({ businessID, keyId });
    }

    /**
     * Withdraw a credential at the identity provider and take the account it
     * signs in as out of the tenant's configuration.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Retired the named key',
        type: BasicResponseDTO,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @Delete(':keyId')
    @ApiOperation({ operationId: 'Delete a user key' })
    retire(@Param('keyId') keyId: string, @Req() request: AuthorizedRequest) {
        const { businessID } = request.user;
        return this.keysService.retire({ businessID, keyId });
    }
}
