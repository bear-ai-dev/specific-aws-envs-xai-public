import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { FeatureRequestService } from './featureRequest.service.js';
import { CreateFeatureRequestDto } from './dto/createFeatureRequest.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';

@Controller('feature-request')
@ApiTags('Feature Requests')
export class FeatureRequestController {
    constructor(private readonly featureRequestService: FeatureRequestService) {}

    @Post()
    create(@Body() createFeatureRequestDto: CreateFeatureRequestDto) {
        return this.featureRequestService.create(createFeatureRequestDto);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get(':featureName')
    findOne(@Param('featureName') featureName: string) {
        return this.featureRequestService.findOne(featureName);
    }
}
