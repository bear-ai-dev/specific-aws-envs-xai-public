import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    UseGuards,
    Logger,
    Req,
    NotFoundException,
    Query,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto, CreateServiceResponse } from './dto/createService.dto';
import { DeleteServiceDTO } from './dto/deleteService.dto';
import { UpdateServiceDto } from './dto/updateService.dto';
import { AuthGuard } from '@nestjs/passport';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiExtraModels,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import {
    AggregatedUsageResponse,
    QueryParamUsageDto,
    ReadServiceResponse,
    ReadServiceUsageData,
    UnAggregatedUsageResponse,
} from './dto/readService.dto';
import { BasicResponseDTO } from '../basicResponseDTO';
@ApiExtraModels(UnAggregatedUsageResponse)
@ApiExtraModels(AggregatedUsageResponse)
@ApiBearerAuth('bearer')
@Controller('services')
@ApiTags('Services')
export class PublicAPIServicesController {
    constructor(readonly servicesService: ServicesService) {}

    /**
     * List all services created in this account
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadServiceResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Get all services' })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.servicesService.findAll({ businessID });
    }

    /**
     * Find a service
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadServiceResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Service Not Found',
        type: NotFoundException,
    })
    @ApiOperation({ operationId: 'Get a service by ID' })
    @UseGuards(AuthGuard('jwt'))
    @Get(':serviceId')
    findOne(@Param('serviceId') serviceId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.servicesService.findOne({ businessID, serviceId });
    }

    /**
     * Create a service
     *
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Service Created',
        type: CreateServiceResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Create a service' })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createServiceDto: CreateServiceDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.servicesService.create({ ...createServiceDto, businessID });
    }

    /**
     * Update a service
     *
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Service Updated',
        type: CreateServiceResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Service Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Put(':serviceId')
    @ApiOperation({ operationId: 'Update a service' })
    update(@Body() updateServiceDto: UpdateServiceDto, @Req() request: Request, @Param('serviceId') serviceId) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.servicesService.update({ ...updateServiceDto, serviceId, businessID });
    }

    /**
     * Delete a service
     */
    @ApiOkResponse({
        status: 200,
        description: 'Service Deleted',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Service Not Found',
        type: NotFoundException,
    })
    @ApiOperation({ operationId: 'Delete a service' })
    @UseGuards(AuthGuard('jwt'))
    @Delete(':serviceId')
    remove(@Param('serviceId') serviceId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.servicesService.remove({ businessID, serviceId });
    }

    /**
     * Get usage data for a service
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadServiceUsageData,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Service Not Found',
        type: NotFoundException,
    })
    @ApiOperation({ operationId: 'Get usage data for a service' })
    @UseGuards(AuthGuard('jwt'))
    @Get(':serviceId/usage')
    findUsage(@Param('serviceId') serviceId: string, @Req() request: Request, @Query() query: QueryParamUsageDto) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;

        return this.servicesService.findUsageForService({ businessID, serviceId }, query);
    }
}

@ApiBearerAuth('bearer')
@Controller('services')
@ApiTags('Services')
export class PrivateAPIServicesController extends PublicAPIServicesController {}
