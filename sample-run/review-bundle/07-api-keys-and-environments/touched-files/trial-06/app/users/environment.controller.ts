import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { EnvironmentService } from './users.service.js';
import { UpdateEnvironmentDto } from './dto/update-environment.dto.js';
import { ReadEnvionmentResponse } from './dto/read-environment.dto.js';
import { UserEntity } from './entities/user.entity.js';
import { PermissionsGuard } from '../authz/PermissionsGaurd.js';
import { UserPermissions } from './user.permissions.js';

/**
 * Manage which environment a signed-in console user is working in.
 */
@ApiBearerAuth('bearer')
@Controller('users/environment')
@ApiTags('Environment')
export class EnvironmentController {
    constructor(private readonly environmentService: EnvironmentService) {}

    /**
     * Get all user environments
     */
    @ApiOkResponse({
        status: 200,
        description: 'Environments for the current user',
        type: UserEntity,
        isArray: true,
    })
    @ApiOperation({ operationId: 'Get all environments for a user', description: 'Get all user environments' })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    getEnvironments(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { sub } = request.user;
        return this.environmentService.getEnvironmentsForUser(sub);
    }

    /**
     * Change the current users environment
     */
    @ApiOkResponse({
        status: 200,
        description: 'Environment updated',
        type: ReadEnvionmentResponse,
    })
    @ApiOperation({
        operationId: 'Update current users enviornment',
        description: 'Change the current users environment',
    })
    @UseGuards(AuthGuard('jwt'))
    @Put()
    updateCurrent(@Body() updateEnvironmentDto: UpdateEnvironmentDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { sub } = request.user;
        return this.environmentService.updateEnvironment(sub, updateEnvironmentDto.environment);
    }

    /**
     * Change any users environment
     */
    @ApiOkResponse({
        status: 200,
        description: 'Environment updated',
        type: ReadEnvionmentResponse,
    })
    @ApiOperation({ operationId: 'Update any users environment', description: 'Change any users environment' })
    @UseGuards(PermissionsGuard([UserPermissions.ADMIN]))
    @UseGuards(AuthGuard('jwt'))
    @Put('admin')
    updateAny(@Body() updateEnvironmentDto: UpdateEnvironmentDto) {
        if (!updateEnvironmentDto.userSubject) {
            throw new BadRequestException('userSubject is required');
        }
        return this.environmentService.updateEnvironment(
            updateEnvironmentDto.userSubject,
            updateEnvironmentDto.environment,
        );
    }
}
