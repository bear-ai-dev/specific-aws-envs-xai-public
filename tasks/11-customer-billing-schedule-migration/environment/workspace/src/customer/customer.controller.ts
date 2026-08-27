import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Req,
    UseGuards,
    Put,
    NotFoundException,
    Query,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, CreateCustomerResponseDto } from './dto/create-customer.dto';
import { Request } from 'express';
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
import { AuthGuard } from '@nestjs/passport';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BasicResponseDTO } from '../basicResponseDTO';
import {
    AggregatedUsageResponse,
    QueryParamUsageDto,
    ReadCustomerResponseDTO,
    ReadCustomerUsageData,
    UnAggregatedUsageResponse,
} from './dto/read-customer.dto';

@ApiBearerAuth('bearer')
@Controller('customers')
@ApiTags('Customers')
@ApiExtraModels(UnAggregatedUsageResponse)
@ApiExtraModels(AggregatedUsageResponse)
export class PublicAPICustomerController {
    constructor(readonly customerService: CustomerService) {}

    /**
     * List all customers created in this account
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadCustomerResponseDTO,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Get all Customers' })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.customerService.findAll({ businessID });
    }

    /**
     * Fine one customer
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadCustomerResponseDTO,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Customer Not Found',
        type: NotFoundException,
    })
    @ApiOperation({ operationId: 'Get a customer by ID' })
    @UseGuards(AuthGuard('jwt'))
    @Get(':customerId')
    findOne(@Param('customerId') customerId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.customerService.findOne({ customerId, businessID });
    }

    /**
     * Create a customer
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Customer Created',
        type: CreateCustomerResponseDto,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Create a customer' })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createCustomerDto: CreateCustomerDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID, sub } = request.user;
        console.log(JSON.stringify(createCustomerDto));
        return this.customerService.create({ ...createCustomerDto, businessID }, sub);
    }

    /**
     *  Update a customer
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'Customer Updated',
        type: CreateCustomerDto,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Customer Not Found',
        type: NotFoundException,
    })
    @Put(':customerId')
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Update a customer' })
    update(@Body() updateCustomerDto: UpdateCustomerDto, @Req() request: Request, @Param('customerId') customerId) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.customerService.update({ ...updateCustomerDto, businessID, customerId });
    }

    /**
     * Delete a customer
     */
    @ApiOkResponse({
        status: 200,
        description: 'Customer Deleted',
        type: ReadCustomerResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Customer Not Found',
        type: NotFoundException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Delete(':customerId')
    @ApiOperation({ operationId: 'Delete a customer' })
    remove(@Param('customerId') customerId: string, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.customerService.remove({ customerId, businessID });
    }

    /**
     * Get usage data for a customer
     */
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadCustomerUsageData,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse({
        status: 404,
        description: 'Customer Not Found',
        type: NotFoundException,
    })
    @ApiOperation({ operationId: 'Get usage data for a customer' })
    @UseGuards(AuthGuard('jwt'))
    @Get(':customerId/usage')
    findUsage(@Param('customerId') customerId: string, @Req() request: Request, @Query() query: QueryParamUsageDto) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;

        return this.customerService.findUsageForCustomer({ businessID, customerId }, query);
    }
}

@ApiBearerAuth('bearer')
@Controller('customers')
@ApiTags('Customers')
export class PrivateAPICustomerController extends PublicAPICustomerController {}
