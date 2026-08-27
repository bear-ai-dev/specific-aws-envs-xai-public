import { Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthorizedRequest } from '../authz/jwt-local.gaurd.js';
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

    @ApiOkResponse({
        status: 200,
        description: 'Keys found',
        type: ReadKeysResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSREAD]))
    @UseGuards(AuthGuard('jwt'))
    @Get()
    @ApiOperation({ operationId: 'Find all keys in the account' })
    findAll(@Req() request: AuthorizedRequest) {
        return this.keysService.findAll({
            subject: request?.user?.sub,
            businessID: request?.user?.businessID,
        });
    }

    @ApiOkResponse({
        status: 200,
        description: 'Key secret rotated',
        type: RotateKeyResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @Put(':keyId')
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    rotate(@Param('keyId') keyId: string, @Req() request: AuthorizedRequest) {
        return this.keysService.rotate({
            keyId,
            subject: request?.user?.sub,
            businessID: request?.user?.businessID,
        });
    }

    @ApiOkResponse({
        status: 200,
        description: 'Key deleted',
        type: BasicResponseDTO,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @Delete(':keyId')
    @ApiOperation({ operationId: 'Delete a user key' })
    retire(@Param('keyId') keyId: string, @Req() request: AuthorizedRequest) {
        return this.keysService.retire({
            keyId,
            subject: request?.user?.sub,
            businessID: request?.user?.businessID,
        });
    }
}
