import {
    Controller,
    Get,
    Body,
    UseGuards,
    Put,
    Req,
    UseInterceptors,
    Post,
    UploadedFile,
    FileTypeValidator,
    MaxFileSizeValidator,
    ParseFilePipe,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Express } from 'express';
import { ReadSettingsResponse } from './dto/read-setting.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { BasicResponseDTO } from '../basicResponseDTO';

@ApiBearerAuth('bearer')
@Controller('settings')
@ApiTags('Settings')
export class SettingsController {
    constructor(private readonly settingService: SettingsService) {}

    /**
     * Return all Settings for a business
     */
    @ApiOkResponse({
        status: 200,
        description: 'Returned platform settings',
        type: ReadSettingsResponse,
    })
    @ApiOperation({ operationId: 'Get Settings' })
    @UseGuards(AuthGuard('jwt'))
    @Get()
    findAll(@Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;
        return this.settingService.findAll({ businessID });
    }

    /**
     * Update settings <br>
     * All fields are optional
     */
    @ApiOkResponse({
        status: 200,
        description: 'Updated platform settings',
        type: ReadSettingsResponse,
    })
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ operationId: 'Update Settings' })
    @Put()
    update(@Body() updateSettingDto: UpdateSettingsDto, @Req() request: Request) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;

        return this.settingService.update({ ...updateSettingDto, businessID });
    }

    @ApiOkResponse({
        status: 201,
        description: 'A message describing the upload success',
        type: BasicResponseDTO,
    })
    @ApiOperation({ operationId: 'Upload Invoice Image' })
    @Post('invoiceImage')
    @UseInterceptors(FileInterceptor('file'))
    @UseGuards(AuthGuard('jwt'))
    uploadFile(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new FileTypeValidator({ fileType: '.(png|jpg|jpeg)' }),
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 30 }),
                ],
            })
        )
        file: Express.Multer.File,
        @Req() request: Request
    ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        const { businessID } = request.user;

        return this.settingService.fileUpload({ file: file.buffer, businessID });
    }
}
