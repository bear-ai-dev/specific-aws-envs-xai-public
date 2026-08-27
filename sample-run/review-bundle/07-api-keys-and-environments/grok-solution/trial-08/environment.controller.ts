import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
import { AuthorizedRequest } from '../authz/jwt-local.gaurd.js';
import { UpdateEnvironmentDto } from './dto/update-environment.dto.js';
import { ReadEnvionmentResponse } from './dto/read-environment.dto.js';
import { UserEntity } from './entities/user.entity.js';
import { UserPermissions } from './user.permissions.js';
import { EnvironmentService } from './users.service.js';

@ApiBearerAuth('bearer')
@Controller('users/environment')
@ApiTags('Environment')
export class EnvironmentController {
    constructor(private readonly environmentService: EnvironmentService) {}

    /**
     * Change the current users environment
     */
    @ApiOkResponse({
        status: 200,
        description: 'Environment updated',
        type: ReadEnvionmentResponse,
    })
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Update current users enviornment' })
    @Put()
    update(@Body() updateEnvironmentDto: UpdateEnvironmentDto, @Req() request: AuthorizedRequest) {
        return this.environmentService.updateCurrentEnvironment({
            subject: request?.user?.sub,
            environment: updateEnvironmentDto.environment,
        });
    }

    /**
     * Get all user environments
     */
    @ApiOkResponse({
        status: 200,
        description: 'Environments for the signed-in user',
        type: [UserEntity],
    })
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Get all environments for a user' })
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { sub } = request.user;
        return this.environmentService.getEnvironmentsForUser(sub);
    }

    /**
     * Change any users environment
     */
    @ApiOkResponse({
        status: 200,
        description: 'Environment updated',
        type: ReadEnvionmentResponse,
    })
    @UseGuards(PermissionsGuard([UserPermissions.ADMIN]))
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Update any users environment' })
    @Put('admin')
    updateAdmin(@Body() updateEnvironmentDto: UpdateEnvironmentDto) {
        return this.environmentService.updateCurrentEnvironment({
            subject: updateEnvironmentDto.userSubject,
            environment: updateEnvironmentDto.environment,
        });
    }
}
