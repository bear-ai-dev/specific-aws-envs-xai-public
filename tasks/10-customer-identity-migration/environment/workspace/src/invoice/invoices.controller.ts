import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateInvoicesDto } from './dto/create-Invoices.dto';
import { InvoicesService } from './invoices.service';
import { UpdateInvoicesDto } from './dto/update-invoices.dto';
import { Request } from 'express';
import { GenerateOffCycleDto } from './dto/createOffcycleInvoice';

@ApiBearerAuth('bearer')
@Controller('invoices')
@ApiTags('Invoices')
export class InvoicesController {
    constructor(private readonly invoiceService: InvoicesService) {}

    @ApiOperation({ operationId: 'GetOne' })
    @UseGuards(AuthGuard('jwt'))
    @Get(':invoiceId')
    getOne(@Req() request: Request, @Param('invoiceId') invoiceId: string, @Query('download') download = 'false') {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.invoiceService.findOne(businessID, invoiceId, download);
    }

    @ApiOperation({ operationId: 'Create' })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createInvoiceDto: CreateInvoicesDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        if (createInvoiceDto?.items) {
            return this.invoiceService.create({ businessID, ...createInvoiceDto });
        }
        if (createInvoiceDto?.start || createInvoiceDto?.end) {
            return this.invoiceService.generateInvoiceForUsageTotal({ businessID, ...createInvoiceDto });
        }
    }

    @ApiOperation({ operationId: 'Update' })
    @UseGuards(AuthGuard('jwt'))
    @Put(':invoiceId')
    update(
        @Body() updateInvoicesDto: UpdateInvoicesDto,
        @Req() request: Request,
        @Param('invoiceId') invoiceId: string
    ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.invoiceService.update({ ...updateInvoicesDto, businessID, invoiceId });
    }
}
