import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthorizedRequest, LocalJWTAuthGuard } from '../authz/jwt-local.gaurd.js';
import { CustomerService } from '../customer/customer.service.js';
import { PortalService } from './portal.service.js';
import {
    ApiBadRequestResponse,
    ApiExtraModels,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { ConfigurationResponse, PortalPagesConfigurationDto } from './dto/configuration.dto.js';
import { CustomerBillingResponse } from './dto/customer.dto.js';
import { ListInvoicesResponse } from './dto/list-invoices.dto.js';
import { ReadSingleInvoiceResponse } from './dto/single-invoice.dto.js';
import { UsageOfCurrentBillingCycle } from './dto/usage.dto.js';
import { customerNotFoundResponseSchema, GetCustomerStripePortalResponse } from '../customer/dto/read-customer.dto.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { UpdatePortalCustomerDto, UpdateCustomerResponseDto } from './dto/update-customer.dto.js';
import { AuthGuard } from '@nestjs/passport';
import {
    AppearanceOfferingPortalDto,
    CTAOfferingPortalDto,
    FeaturedOfferingPortalDto,
    PortalOfferingPageDto,
} from './dto/PortalOfferingPageDto.js';

@Controller('portal')
@ApiTags('Portal')
@ApiExtraModels(PortalOfferingPageDto)
@ApiExtraModels(AppearanceOfferingPortalDto)
@ApiExtraModels(CTAOfferingPortalDto)
@ApiExtraModels(FeaturedOfferingPortalDto)
export class PortalController {
    constructor(
        readonly customerService: CustomerService,
        readonly portalService: PortalService,
    ) {}

    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: UsageOfCurrentBillingCycle,
    })
    @UseGuards(LocalJWTAuthGuard)
    @Get('/customer/usage')
    @ApiOperation({ operationId: 'Get customer usage for current billing cycle' })
    findDashboard(@Req() request: AuthorizedRequest) {
        const { businessID, sub } = request.user;
        return this.portalService.findUsageOfCurrentBillingCycle(businessID, sub);
    }

    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: CustomerBillingResponse,
    })
    @UseGuards(LocalJWTAuthGuard)
    @Get('/customer')
    @ApiOperation({ operationId: 'Get customer information' })
    findCustomer(@Req() request: AuthorizedRequest) {
        const { businessID, sub } = request.user;
        return this.portalService.findCustomer(businessID, sub);
    }

    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: UpdateCustomerResponseDto,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiNotFoundResponse(customerNotFoundResponseSchema)
    @UseGuards(LocalJWTAuthGuard)
    @Put('/customer')
    @ApiOperation({ operationId: 'Update customer' })
    updateCustomer(@Req() request: AuthorizedRequest, @Body() updateCustomerDto: UpdatePortalCustomerDto) {
        const { businessID, sub } = request.user;
        return this.portalService.updateCustomer(businessID, sub, updateCustomerDto);
    }

    @ApiOkResponse({
        status: 200,
        description: 'Stripe portal url generated',
        type: GetCustomerStripePortalResponse,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Get Stripe Portal for customer' })
    @UseGuards(LocalJWTAuthGuard)
    @Get('/customer/stripePortal')
    getStripePortalUrl(@Req() request: AuthorizedRequest) {
        const { businessID, sub } = request.user;
        return this.portalService.getStripePortalUrl(businessID, sub);
    }

    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ReadSingleInvoiceResponse,
    })
    @UseGuards(LocalJWTAuthGuard)
    @Get('/invoices/:invoiceId')
    @ApiOperation({ operationId: 'Get detailed invoice' })
    findInvoice(
        @Req() request: AuthorizedRequest,
        @Param('invoiceId') invoiceId: string,
        @Query('download') download = 'false',
    ) {
        const { businessID, sub } = request.user;
        return this.portalService.findInvoice({ businessID, customerId: sub, invoiceId, download });
    }

    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ListInvoicesResponse,
    })
    @UseGuards(LocalJWTAuthGuard)
    @Get('/invoices')
    @ApiOperation({ operationId: 'Get list of invoices for specified SaaS customer' })
    findInvoices(@Req() request: AuthorizedRequest) {
        const { businessID, sub } = request.user;
        return this.portalService.findInvoices(businessID, sub);
    }

    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ConfigurationResponse,
    })
    @UseGuards(LocalJWTAuthGuard)
    @Get('/configuration')
    @ApiOperation({ operationId: 'Get portal configuration' })
    findConfiguration(@Req() request: AuthorizedRequest) {
        const { businessID } = request.user;
        return this.portalService.findConfiguration(businessID);
    }
    @ApiOkResponse({
        status: 200,
        description: 'OK',
        type: ConfigurationResponse,
    })
    @UseGuards(AuthGuard('jwt'))
    @Put('/configuration')
    @ApiOperation({ operationId: 'Update portal configuration' })
    updateConfiguration(@Req() request: AuthorizedRequest, @Body() body: PortalPagesConfigurationDto) {
        const { businessID, sub } = request.user;
        return this.portalService.updateConfiguration({ businessID, subject: sub, pages: body?.pages });
    }
}
