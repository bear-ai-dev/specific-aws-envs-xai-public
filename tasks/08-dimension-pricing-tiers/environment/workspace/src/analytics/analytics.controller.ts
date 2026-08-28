import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    @ApiOperation({ operationId: 'GetAll' })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(
        @Req() request: Request,
        @Query('metric') metric: string,
        @Query('start') start: string,
        @Query('end') end: string,
        @Query('customerId') customerId: string,
    ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.analyticsService.findAll(businessID, metric, start, end, customerId);
    }
}
