import {
    Controller,
    Get,
    Post,
    Body,
    Delete,
    UseGuards,
    Req,
    ConflictException,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import {
    ApiConflictResponse,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BasicResponseDTO } from '../basicResponseDTO';
import { DeletedStripeAccountAssociationResponse, OnboardingDto, OnboardingResponseDTO } from './dto/onboarding.dto';
import { Request } from 'express';

@Controller('onboarding/stripe')
@ApiTags('Onboarding')
export class OnboardingController {
    constructor(private readonly onboardingService: OnboardingService) {}

    /**
     * Onboard a stripe standard account to be assocaited with your user account
     */
    @ApiOkResponse({
        description: 'Response for creating a stripe account',
        type: OnboardingResponseDTO,
    })
    @ApiConflictResponse({
        description: 'Response for when a new connection is attempted to be established for an existing account',
        type: ConflictException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() onboardingDto: OnboardingDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID, sub } = request.user;
        return this.onboardingService.create({ ...onboardingDto, businessID, subject: sub });
    }
    /**
     * Get connected stripe account information
     */
    @ApiOkResponse({
        description: 'Connected stripe account information',
        type: BasicResponseDTO,
    })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.onboardingService.findAll({ businessID });
    }

    /**
     * Remove stripe connection from account
     */
    @ApiOkResponse({
        description: 'Deleted Account Sucessfully',
        type: DeletedStripeAccountAssociationResponse,
    })
    @ApiNotFoundResponse({ description: 'Unable to find account association', type: NotFoundException })
    @ApiInternalServerErrorResponse({
        description: 'Failed to delete the account association',
        type: InternalServerErrorException,
    })
    @UseGuards(AuthGuard('jwt'))
    @Delete()
    remove(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.onboardingService.remove({ businessID });
    }
}
