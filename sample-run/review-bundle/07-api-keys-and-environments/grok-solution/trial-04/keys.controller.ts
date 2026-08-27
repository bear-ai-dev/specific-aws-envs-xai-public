import { Controller, Delete, Get, Param, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
import { AuthorizedRequest } from '../authz/jwt-local.gaurd.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { UserPermissions } from '../users/user.permissions.js';
import { ReadKeysResponseDto, RotateKeyResponseDto } from './dto/read-key.dto.js';
import { KeysService } from './keys.service.js';

@ApiBearerAuth('bearer')
@Controller('keys')
@ApiTags('Keys')
export class KeysController {
    constructor(private readonly keysService: KeysService) {}

    /**
     * Find all machine credentials held by the current account in the current environment
     */
    @ApiOkResponse({
        status: 200,
        description: 'Returned the machine credentials for the current account',
        type: ReadKeysResponseDto,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSREAD]))
    @UseGuards(AuthGuard('jwt'))
    @Get()
    @ApiOperation({ operationId: 'Find all keys in the account' })
    findAll(@Req() request: AuthorizedRequest) {
        if (!request?.user?.businessID) {
            throw new UnauthorizedException();
        }
        return this.keysService.findAll({ businessID: request.user.businessID });
    }

    /**
     * Rotate the secret on a machine credential the current account holds
     */
    @ApiOkResponse({
        status: 200,
        description: 'Rotated the secret for the named credential',
        type: RotateKeyResponseDto,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @Put(':keyId')
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    @ApiParam({
        name: 'keyId',
        required: true,
        type: 'string',
        description: 'The identifier of the machine credential to rotate',
    })
    rotate(@Param('keyId') keyId: string, @Req() request: AuthorizedRequest) {
        if (!request?.user?.businessID) {
            throw new UnauthorizedException();
        }
        return this.keysService.rotate({
            keyId,
            businessID: request.user.businessID,
        });
    }

    /**
     * Retire a machine credential the current account holds
     */
    @ApiOkResponse({
        status: 200,
        description: 'Retired the named credential',
        type: BasicResponseDTO,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @Delete(':keyId')
    @ApiOperation({ operationId: 'Delete a user key' })
    @ApiParam({
        name: 'keyId',
        required: true,
        type: 'string',
        description: 'The identifier of the machine credential to retire',
    })
    retire(@Param('keyId') keyId: string, @Req() request: AuthorizedRequest) {
        if (!request?.user?.businessID) {
            throw new UnauthorizedException();
        }
        return this.keysService.retire({
            keyId,
            businessID: request.user.businessID,
        });
    }
}
