import { Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { UserPermissions } from '../users/user.permissions.js';
import { ReadKeysResponse, RotateKeyResponse } from './dto/read-key.dto.js';
import { KeysService } from './keys.service.js';

@ApiBearerAuth('bearer')
@Controller('keys')
@ApiTags('Keys')
export class KeysController {
    constructor(private readonly keysService: KeysService) {}

    /**
     * Return the machine credentials the current account holds in the environment the caller is in.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Returned account keys',
        type: ReadKeysResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSREAD]))
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Find all keys in the account' })
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.findAll(businessID);
    }

    /**
     * Replace the secret on one credential. Every other credential is left untouched.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Rotated key',
        type: RotateKeyResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    @Put(':keyId')
    rotate(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.rotate(businessID, keyId);
    }

    /**
     * Withdraw a credential at the identity provider and take the account it signs in as out of the tenant's configuration.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Deleted key',
        type: BasicResponseDTO,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Delete a user key' })
    @Delete(':keyId')
    retire(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.retire(businessID, keyId);
    }
}
