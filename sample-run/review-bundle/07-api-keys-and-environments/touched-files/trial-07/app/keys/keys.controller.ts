import { Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
     * List the machine credentials this account holds in the current environment.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Found keys',
        type: ReadKeysResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSREAD]))
    @UseGuards(AuthGuard('jwt'))
    @Get()
    @ApiOperation({ operationId: 'Find all keys in the account' })
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.findAll({ businessID });
    }

    /**
     * Rotate the secret on a single machine credential.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Rotated key secret',
        type: RotateKeyResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @Put(':keyId')
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    @ApiParam({ name: 'keyId', required: true, type: String })
    rotate(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.rotate({ businessID, keyId });
    }

    /**
     * Retire a machine credential so it can no longer sign in.
     */
    @ApiOkResponse({
        status: 200,
        description: 'Deleted key',
        type: BasicResponseDTO,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @Delete(':keyId')
    @ApiOperation({ operationId: 'Delete a user key' })
    @ApiParam({ name: 'keyId', required: true, type: String })
    retire(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.retire({ businessID, keyId });
    }
}
