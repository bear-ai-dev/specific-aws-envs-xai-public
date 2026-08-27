import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req, NotFoundException, Put } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DimensionsService } from './dimensions.service';
import { CreateDimensionDto, CreateDimensionResponse } from './dto/create-dimension.dto';
import { Request } from 'express';
import {
    ApiBadRequestResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { UpdateDimensionDto } from './dto/update-dimension.dto';
import { ReadDimensionResponse } from './dto/read-dimension.dto';
import { BasicResponseDTO } from '../basicResponseDTO';

@Controller('dimensions')
@ApiTags('Dimensions')
export class PublicAPIDimensionsController {
    constructor(readonly dimensionsService: DimensionsService) {}

    /**
     * List all dimensions created in this account
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadDimensionResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    @ApiOperation({ operationId: 'Get all dimensions' })
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.dimensionsService.findAll({ businessID });
    }

    /**
     * Fine a dimension
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadDimensionResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Dimension Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Get(':dimensionId')
    @ApiOperation({ operationId: 'Get a dimension by ID' })
    findOne(@Param('dimensionId') dimensionId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.dimensionsService.findOne({ dimensionId, businessID });
    }

    /**
     * Create a dimension
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: CreateDimensionResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    @ApiOperation({ operationId: 'Create a dimension' })
    create(@Body() createDimensionDto: CreateDimensionDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID, sub } = request.user;
        return this.dimensionsService.create({ ...createDimensionDto, businessID }, sub);
    }

    /**
     * Update a dimension
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Dimension Updated',
        type: CreateDimensionResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Dimension Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Put(':dimensionId')
    @ApiOperation({ operationId: 'Update a dimension' })
    update(@Body() updateOfferingDto: UpdateDimensionDto, @Req() request: Request, @Param('dimensionId') dimensionId) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID, sub } = request.user;
        return this.dimensionsService.update({ ...updateOfferingDto, dimensionId, businessID }, sub);
    }

    /**
     * Delete a dimension
     */
    @ApiOkResponse({
        status: 200,
        description: 'Dimension Deleted',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Dimension Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Delete(':dimensionId')
    @ApiOperation({ operationId: 'Delete a dimension' })
    remove(@Param('dimensionId') dimensionId, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.dimensionsService.remove({ dimensionId, businessID });
    }
}

@Controller('dimensions')
@ApiTags('Dimensions')
export class PrivateAPIDimensionsController extends PublicAPIDimensionsController {}
