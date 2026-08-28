import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { InfluxService } from '../influx/influx.service';
import { SettingsEntity, StripeConnected } from './entities/settings.entity';
import { ReadSettingsResponseData } from './dto/read-setting.dto';
import { putDocument } from '../utils/aws/s3';
import { BasicResponseDTO } from '../basicResponseDTO';
import { FileUploadDto } from './dto/fileUpload.dto';
import { randomUUID } from 'crypto';
import { OnboardingService } from '../onboarding/onboarding.service';
import Stripe from 'stripe';
@Injectable()
export class SettingsService {
    private static readonly logger = new Logger(SettingsService.name);

    constructor(readonly InfluxService: InfluxService) {}

    async findAll({ businessID }: { businessID: string }): Promise<ReadSettingsResponseData[]> {
        SettingsService.logger.log(`Getting platform settings for business: ${businessID}`);
        const [settingsDBModels] = await Promise.all([this.InfluxService.getLatestSettings({ businessID })]);
        SettingsService.logger.debug(`Platform settings: ${JSON.stringify(settingsDBModels)}`);
        let responseDto;
        let stripeConnected = StripeConnected.notConnected;

        if (settingsDBModels.length > 0) {
            responseDto = settingsDBModels.map(
                (entity) => new ReadSettingsResponseData(SettingsEntity.dbModelToEntity(entity))
            );
        } else {
            responseDto = [new ReadSettingsResponseData(new SettingsEntity({ businessID }))];
        }

        const stripe = new Stripe(process.env.STRIPE_TOKEN, { apiVersion: '2022-08-01' });
        if (responseDto[0]?.stripeAccountId) {
            try {
                const account = await stripe.accounts.retrieve();
                if (account.details_submitted) {
                    stripeConnected = StripeConnected.connected;
                }
            } catch (e) {
                throw new InternalServerErrorException('Failed to get Stripe Account for User, try again');
            }
        }
        return [{ ...responseDto[0], stripeConnected }];
    }

    async update({
        businessID,
        ...updatedFileds
    }: UpdateSettingsDto): Promise<{ data: ReadSettingsResponseData[]; message: string }> {
        SettingsService.logger.log('Updating platform settings');
        SettingsService.logger.log(JSON.stringify(updatedFileds?.cloudIAM));
        const [setting] = await this.findAll({ businessID });
        const { loadPoints } = this.InfluxService;
        const entity = new SettingsEntity({
            ...setting,
            ...updatedFileds,
            businessID,
        });
        const dbModel = SettingsEntity.transformer(entity, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-config`, 'meteringco', dbModel);
        return { data: [new ReadSettingsResponseData(entity)], message: 'Setting updated successfully' };
    }

    async fileUpload({ file, businessID }: FileUploadDto): Promise<BasicResponseDTO> {
        const invoiceImageBucket = `meteringco-${process.env.STAGE}-brand-images`;
        const uuid = randomUUID();
        const imageKey = `${businessID}-invoice-image-${uuid}`;
        await putDocument(file, invoiceImageBucket, imageKey).done();
        this.update({
            businessID,
            logoUrl: `https://meteringco-${process.env.STAGE}-brand-images.s3.amazonaws.com/${businessID}-invoice-image-${uuid}`,
        });

        return { message: 'File uploaded successfully' };
    }
}
