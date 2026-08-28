import { Controller, Post, Body, UseGuards, Req, NotFoundException, Get, Param, Put, Delete } from '@nestjs/common';
import { MeasurementConfigService } from './measurement-config.service';
import {
    CreateMeasurementConfigDto,
    CreateMeasurementConfigurationResponse,
} from './dto/create-measurement-config.dto';
import { AuthGuard } from '@nestjs/passport';
import {
    ApiBadRequestResponse,
    ApiCreatedResponse,
    ApiExtraModels,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { MeasurementResponseEntityEnricher, ReadMeasurementConfigResponse } from './dto/read-measurement-config.dto';
import {
    UpdateAgentAccessInformation,
    UpdateInfrastructureAccessInformation,
    UpdateMeasurementConfigDto,
} from './dto/update-measurement-config.dto';
import { BasicResponseDTO } from '../basicResponseDTO';
import {
    AgentAccessInformation,
    DatastoreAccessInformation,
    InfrastructureAccessInformation,
} from './entities/measurement-config.entity';

@ApiExtraModels(InfrastructureAccessInformation)
@ApiExtraModels(AgentAccessInformation)
@ApiExtraModels(DatastoreAccessInformation)
@ApiExtraModels(MeasurementResponseEntityEnricher)
@ApiExtraModels(UpdateAgentAccessInformation)
@ApiExtraModels(UpdateInfrastructureAccessInformation)
@Controller('measurements')
@ApiTags('Measurements')
export class MeasurementConfigController {
    constructor(private readonly measurementConfigService: MeasurementConfigService) {}

    /**
     * List all measurements created in this account
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadMeasurementConfigResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Get all measurements' })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.measurementConfigService.findAll({ businessID });
    }

    /**
     * Find a measurement
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadMeasurementConfigResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Measurement Not Found',
        type: NotFoundException,
    })
    @ApiOperation({ operationId: 'Get a measurement by ID' })
    @UseGuards(AuthGuard('jwt'))
    @Get(':measurementId')
    findOne(@Param('measurementId') measurementId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.measurementConfigService.findOne({ businessID, measurementId });
    }

    /**
     * Create a measurement
     *
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Measurement Created',
        type: CreateMeasurementConfigurationResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Create a measurement' })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createMeasurementConfigDto: CreateMeasurementConfigDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID, sub: subject } = request.user;
        return this.measurementConfigService.create({ ...createMeasurementConfigDto, businessID }, subject);
    }

    /**
     * Update a measurement
     */
    @ApiOkResponse({
        status: 200,
        description: 'Measurement Updated',
        type: CreateMeasurementConfigurationResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Measurement Not Found',
        type: NotFoundException,
    })
    @ApiOperation({ operationId: 'Update a measurement' })
    @UseGuards(AuthGuard('jwt'))
    @Put(':measurementId')
    update(
        @Param('measurementId') measurementId: string,
        @Body() params: UpdateMeasurementConfigDto,
        @Req() request: Request
    ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID, sub: subject } = request.user;
        return this.measurementConfigService.update(
            {
                ...params,
                measurementId,
                businessID,
            },
            subject
        );
    }
    /**
     * Delete a measurement
     */
    @ApiOkResponse({
        status: 200,
        description: 'Measurement deleted',
        type: BasicResponseDTO,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Measurement Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Delete(':measurementId')
    @ApiOperation({ operationId: 'Delete a measurement' })
    delete(@Param('measurementId') measurementId, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.measurementConfigService.remove({ measurementId, businessID });
    }
}
