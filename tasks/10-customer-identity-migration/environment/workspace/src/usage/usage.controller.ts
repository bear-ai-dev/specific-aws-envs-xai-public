import { BadRequestException, Body, Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { serializeError } from 'serialize-error';
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BasicResponseDTO } from '../basicResponseDTO';
import { CreateUsageDto } from './dto/create-usage.dto';
import { UsageService } from './usage.service';
import { Request } from 'express';
import { LogGaurd } from '../authz/logGaurd';
import { DlqType, StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
import { Validator } from 'class-validator';
import { CreateStandardMeasurementDto } from '../measurement-config/dto/create-standard-measurement.dto';

@ApiBearerAuth('bearer')
@ApiTags('Usage')
@Controller('usage')
export class UsageController {
    readonly validator = new Validator();
    public static readonly logger = new Logger(UsageController.name);
    constructor(public readonly usageService: UsageService) {}

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
}

@ApiBearerAuth('bearer')
@ApiTags('Usage')
@Controller('usage')
export class PrivateAPIUsageController extends UsageController {
    @UseGuards(LogGaurd, AuthGuard('jwt'))
    @Post('db')
    async dbUsage(@Body() createUsageDto) {
        // Custom validator for DB usage, on failure push to DLQ for manual processing
        try {
            UsageController.logger.log('Starting DB Usage Endpoint execution');

            const { message, s3Key } = createUsageDto;
            // TODO: check if the passed in BusinessID is an authorized producer, if not throw message away
            if (s3Key) {
                const [businessID] = s3Key.split('/');

                const parsed = JSON.parse(message);
                const doc = new CreateStandardMeasurementDto({ ...parsed, businessID });
                await this.validator.validateOrReject(doc, { enableDebugMessages: true });
                const input = { ...parsed, businessID };
                return this.usageService.create(input);
            } else {
                AuditService.publishEvent({
                    topic: AuditScope.ERROR,
                    message: 'Unknown S3 Key and BusinessID In datastore measurement system',
                    data: [{ e: 'Unknown S3 Key and BusinessID In datastore measurement system', createUsageDto }],
                });
                throw new BadRequestException(
                    'Invalid message format, please check the documentation for the correct format'
                );
            }
        } catch (e) {
            UsageController.logger.error('Error parsing datastore usage message', e);
            e.stack = undefined;
            await StandardMeasurementEntity.publishFailureToDLQ(
                { originalFileContent: createUsageDto?.message, s3Key: createUsageDto?.s3Key },
                {
                    timestamp: new Date().toISOString(),
                    errorInfo: serializeError(e),
                    results: 'failed to load data',

                    orginalProcessedName: createUsageDto?.s3Key
                        ? createUsageDto?.s3Key
                        : `meteringco-unknown/${randomUUID()}`,
                },
                DlqType.s3
            );
            throw new BadRequestException(
                'Invalid message format, please check the documentation for the correct format, and check DLQ for message'
            );
        }
    }
}
function InjectModel(arg0: string) {
    throw new Error('Function not implemented.');
}
