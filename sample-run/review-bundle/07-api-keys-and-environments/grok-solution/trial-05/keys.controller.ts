import { Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
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
     * List the machine credentials the current account holds in the environment
     * the caller is currently in.
     */
    @ApiOkResponse({
        status: 200,
        description: 'The machine credentials belonging to the current account',
        type: ReadKeysResponseDto,
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
     * Retire a machine credential for good. Withdraws it at the identity
     * provider and takes the account it signs in as out of the tenant's
     * configuration.
     */
    @ApiOkResponse({
        status: 200,
        description: 'The credential was retired',
        type: BasicResponseDTO,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSDELETE]))
    @UseGuards(AuthGuard('jwt'))
    @Delete(':keyId')
    @ApiParam({
        name: 'keyId',
        required: true,
        type: 'string',
        description: 'The client identifier of the machine credential to retire',
    })
    @ApiOperation({ operationId: 'Delete a user key' })
    remove(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.retire({ keyId, businessID });
    }

    /**
     * Ask for a fresh secret on a credential that may have leaked. Replaces the
     * secret on that credential alone and leaves every other credential untouched.
     */
    @ApiOkResponse({
        status: 200,
        description: 'The credential secret was rotated',
        type: RotateKeyResponseDto,
    })
    @UseGuards(PermissionsGuard([UserPermissions.KEYSUPDATE]))
    @UseGuards(AuthGuard('jwt'))
    @Put(':keyId')
    @ApiParam({
        name: 'keyId',
        required: true,
        type: 'string',
        description: 'The client identifier of the machine credential to rotate',
    })
    @ApiOperation({ operationId: 'Rotate a secret for a key' })
    rotate(@Param('keyId') keyId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.keysService.rotate({ keyId, businessID });
    }
}
