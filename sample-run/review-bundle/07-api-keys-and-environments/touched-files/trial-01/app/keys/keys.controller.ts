import { Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
import { UserPermissions } from '../users/user.permissions.js';
import { ReadKeysResponse, RotateKeyResponse } from './dto/read-keys.dto.js';
import { KeysService } from './keys.service.js';

@ApiBearerAuth('bearer')
@Controller('keys')
@ApiTags('Keys')
export class KeysController {
    constructor(private readonly keysService: KeysService) {}

    /**
     * List the machine credentials the current account holds in the environment the caller is in.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Keys found',
        type: ReadKeysResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSREAD]))
    @UseGuards(AuthGuard('jwt'))
    @Get()
    @ApiOperation({ operationId: 'Find all keys in the account' })
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
        description: 'Secret rotated',
        type: RotateKeyResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @Put(':keyId')
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    @ApiParam({ name: 'keyId', type: String })
    rotate(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { businessID } = request.user;
        return this.keysService.rotate({ businessID, keyId });
    }

    /**
     * Retire a credential: withdraw it at the identity provider and remove the account it signs in as.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Key deleted',
        type: BasicResponseDTO,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @Delete(':keyId')
    @ApiOperation({ operationId: 'Delete a user key' })
    @ApiParam({ name: 'keyId', type: String })
    retire(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { businessID } = request.user;
        return this.keysService.retire({ businessID, keyId });
    }
}
