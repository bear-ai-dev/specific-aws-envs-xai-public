import { Controller, Get, Post, Body, Param, UseGuards, Req, NotFoundException, Delete, Put } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { OfferingService } from './offering.service';
import { CreateOfferingDTO, CreateOfferingResponse } from './dto/createOffering.dto';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { ReadOfferingResponseDTO } from './dto/readOffering.dto';
import { BasicResponseDTO } from '../basicResponseDTO';
import { UpdateOfferingDto } from './dto/updateOfferingDto';

/**
 *
 * This is the offering section
 */
@ApiBearerAuth('bearer')
@Controller('offerings')
@ApiTags('Offerings')
export class PublicAPIOfferingController {
    constructor(readonly OfferingService: OfferingService) {}

    /**
     * List all offerings created in this account
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadOfferingResponseDTO,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Get all Offerings' })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.OfferingService.findAll({ businessID });
    }

    /**
     * Find an offering
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadOfferingResponseDTO,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Offering Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Get(':offeringId')
    @ApiOperation({ operationId: 'Get an offering by ID' })
    findOne(@Param('offeringId') offeringId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore

        const { businessID } = request.user;
        return this.OfferingService.findOne({ businessID, offeringId });
    }

    /**
     * Create an offering
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Offering Created',
        type: CreateOfferingResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    @ApiOperation({ operationId: 'Create an offering' })
    create(@Body() createOfferingDto: CreateOfferingDTO, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.OfferingService.create({ ...createOfferingDto, businessID });
    }

    /**
     * Update an offering
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Offering Updated',
        type: CreateOfferingResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Offering Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Put(':offeringId')
    @ApiOperation({ operationId: 'Update an offering' })
    update(
        @Body() updateOfferingDto: UpdateOfferingDto,
        @Req() request: Request,
        @Param('offeringId') offeringId: string
    ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.OfferingService.update({ ...updateOfferingDto, offeringId, businessID });
    }

    /**
     * Delete an offering
     */
    @ApiOkResponse({
        status: 200,
        description: 'Offering Deleted',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Offering Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Delete(':offeringId')
    @ApiOperation({ operationId: 'Delete an offering' })
    delete(@Param('offeringId') offeringId, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.OfferingService.delete({ offeringId, businessID });
    }
}
@ApiBearerAuth('bearer')
@Controller('offerings')
@ApiTags('Offerings')
export class PrivateAPIOfferingController extends PublicAPIOfferingController {}
