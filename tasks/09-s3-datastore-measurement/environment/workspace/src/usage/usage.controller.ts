import { Body, Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BasicResponseDTO } from '../basicResponseDTO';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UsageService } from './usage.service';
import { Request } from 'express';
import { DbMeasuredusageDto } from './dto/dbmeasuredUsage.dto';
import { LogGaurd } from '../authz/logGaurd';

@ApiTags('Usage')
@Controller('usage')
export class UsageController {
    private static readonly logger = new Logger(UsageController.name);
    constructor(private readonly usageService: UsageService) {}

    /**
     * Collect usage data by API-based method.
     * See <a href="https://docs.meteringco.tech/measure-usage-and-collect-data/measure-and-collect-usage-data-at-production-scale">Measure and Collect Usage Data At Production Scale</a>
     * for full documentation on MeteringCo <b>Usage Measurement and Collection</b>.
     * @param createUsageDto
     * @param request
     */
    @ApiCreatedResponse({
        status: 201,
        description: 'OK',
        type: BasicResponseDTO,
    })
    @ApiBadRequestResponse({
        status: 400,
        description: 'Bad Request',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Collect usage data' })
    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createUsageDto: CreateUsageDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.usageService.create({ ...createUsageDto, businessID });
    }

    @UseGuards(LogGaurd, AuthGuard('jwt'))
    @Post('db')
    dbUsage(@Body() createUsageDto) {
        // Custom validator for DB usage, on failure push to DLQ for manual processing

        UsageController.logger.log('Starting DB Usage Endpoint execution');

        const { message, s3Key } = createUsageDto;
        // TODO: check if the passed in BusinessID is an authorized producer, if not throw message away
        if (s3Key) {
            const [businessID] = s3Key.split('/');
            const parsed = JSON.parse(message);
            const input = { ...parsed, businessID };
            return this.usageService.create(input);
        } else {
            // TODO push to DLQ
            return '';
        }
    }
}
