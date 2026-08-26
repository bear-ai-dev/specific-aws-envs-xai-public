import {
    BadRequestException,
    forwardRef,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { CloudIAM, PortalPages, UpdateSettingsDto } from './dto/update-settings.dto.js';
import { assumeRole } from '../utils/aws/sts.js';
import { getInstanceWithFilters } from '../utils/aws/awsEc2.js';
import { PortalOfferingPageDto } from '../portal/dto/PortalOfferingPageDto.js';
import { InfluxService } from '../influx/influx.service.js';
import { SettingsEntity, StripeConnected } from './entities/settings.entity.js';
import { ReadProfileResponse, ReadProfileResponseData, ReadSettingsResponseData } from './dto/read-setting.dto.js';
import { putDocument } from '../utils/aws/s3.js';
import { BasicResponseDTO } from '../basicResponseDTO.js';
import { FileUploadDto } from './dto/fileUpload.dto.js';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { SchedulerService } from '../scheduler/scheduler.service.js';
import { FreeTrialDto } from './dto/freeTrial.dto.js';
import { FreeTrialResponseDto } from './dto/FreeTrialData.js';
import { FreeTrialEntity } from './entities/freeTrial.entity.js';
import { cache as cacheManager } from '../cacheStore.js';
import { Environment } from '../users/dto/Environment.js';
import { AccountState } from './entities/AccountState.js';
import { EnvironmentService } from '../users/users.service.js';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class SettingsService {
    private static readonly logger = new Logger(SettingsService.name);

    constructor(
        @Inject(forwardRef(() => InfluxService)) readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => SchedulerService)) readonly schedulerService: SchedulerService,
        @Inject(forwardRef(() => EnvironmentService)) readonly environmentService: EnvironmentService,
    ) {}

    async findLatestSetting({ businessID }: { businessID: string }): Promise<SettingsEntity> {
        const settingsDBModels = await this.InfluxService.getLatestSettings({ businessID });
        SettingsService.logger.debug(`Platform settings: ${JSON.stringify(settingsDBModels)}`);

        if (settingsDBModels.length > 0) {
            return SettingsEntity.dbModelToEntity(settingsDBModels[0]);
        }
        return new SettingsEntity({ businessID, pages: new PortalPages() });
    }

    async findAll({ businessID }: { businessID: string }): Promise<ReadSettingsResponseData[]> {
        SettingsService.logger.log(`Getting platform settings for business: ${businessID}`);
        const { environment } = await this.environmentService.getEnvironmentForBusinessID(businessID);
        let stripeConnected = StripeConnected.notConnected;
        const latestSetting = await this.findLatestSetting({ businessID });
        if (latestSetting.stripeAccountId) {
            try {
                const stripe = new Stripe(process.env.STRIPE_TOKEN, { apiVersion: '2022-08-01' });
                const account = await stripe.accounts.retrieve();
                if (account.details_submitted) {
                    stripeConnected = StripeConnected.connected;
                }
            } catch (e) {
                throw new InternalServerErrorException('Failed to get Stripe Account for User, try again');
            }
        }

        SettingsService.logger.log(
            `Account State environment: ${environment}, comparision: ${Environment.PRODUCTION}, boolean: ${
                environment === Environment.PRODUCTION
            }`,
        );
        return [
            {
                ...new ReadSettingsResponseData(latestSetting),
                stripeConnected,
                accountState: environment === Environment.PRODUCTION ? AccountState.production : AccountState.sandbox,
            },
        ];
    }

    async update({
        businessID,
        subject,
        ...updatedFileds
    }: UpdateSettingsDto): Promise<{ data: ReadSettingsResponseData[]; message: string }> {
        SettingsService.logger.log('Updating platform settings');
        SettingsService.logger.log(JSON.stringify(updatedFileds));
        const [setting] = await this.findAll({ businessID });
        const { loadPoints } = this.InfluxService;
        const oldEntity = new SettingsEntity({ ...setting, businessID });
        if (Object.prototype.hasOwnProperty.call(updatedFileds, 'cloudIAM')) {
            updatedFileds.cloudIAM = await this.prepareCloudIAM(updatedFileds.cloudIAM);
        }
        let pages = new PortalPages();
        if (oldEntity.pages) {
            pages = oldEntity.pages;
        }
        if (updatedFileds?.pages) {
            pages = PortalPages.handleUpdatePages(pages, updatedFileds);
            if (pages?.offering?.offerings?.length) {
                const errors = [];
                await Promise.all(
                    pages?.offering?.offerings.map(async (page, index) => {
                        if (page === null) {
                            return;
                        } else {
                            const constructedPage = new PortalOfferingPageDto(page);

                            const res = await validate(constructedPage, { enableDebugMessages: true });
                            if (res && res?.length) {
                                //eslint-disable-next-line
                                //@ts-ignore
                                errors.push({ index, errors: res });
                            }
                        }
                    }),
                );
                if (errors.length > 0) {
                    throw new BadRequestException(
                        `Invalid Offering Page Configuration: ${errors.reduce((acc, item) => {
                            acc += ` Page ${item.index + 1}: ${item.errors.reduce((acc, item) => {
                                if (item.children && item.children.length) {
                                    acc += ` ${item.property} ${item.children.reduce((acc, item) => {
                                        acc += ` ${item.property} ${
                                            item.constraints ? Object.values(item.constraints).join(',') : ''
                                        }`;
                                        return acc;
                                    }, '')}`;
                                } else {
                                    acc += ` ${item.property} ${
                                        item.constraints ? Object.values(item.constraints).join(',') : ''
                                    }`;
                                }
                                return acc;
                            }, '')}`;
                            return acc;
                        }, '')}`,
                    );
                }
            }
        }
        const newEntity = new SettingsEntity({
            ...setting,
            ...updatedFileds,
            pages,
            businessID,
        });
        const dbModel = SettingsEntity.transformer(newEntity, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, dbModel);
        await SettingsEntity.handleSchedulerChanges(oldEntity, newEntity, this.schedulerService, subject);
        const responseDto = new ReadSettingsResponseData(newEntity);
        await cacheManager.set(businessID, JSON.stringify(responseDto), 604800);
        return { data: [responseDto], message: 'Setting updated successfully' };
    }

    /**
     * Prepare a customer scraper role for persistence.
     * A blank role disconnects and clears the external id.
     * A settings block that names no role is invalid rather than a disconnect.
     * A named role must be assumable with the supplied external id and the
     * returned credentials must be able to read the instance inventory used by collection.
     */
    private async prepareCloudIAM(cloudIAM?: CloudIAM): Promise<CloudIAM> {
        if (cloudIAM === undefined || cloudIAM === null) {
            throw new BadRequestException([
                'A settings block that names no IAM role is invalid rather than a disconnect',
            ]);
        }
        if (!Object.prototype.hasOwnProperty.call(cloudIAM, 'iamRoleArn')) {
            throw new BadRequestException([
                'A settings block that names no IAM role is invalid rather than a disconnect',
            ]);
        }
        const iamRoleArn = typeof cloudIAM.iamRoleArn === 'string' ? cloudIAM.iamRoleArn.trim() : cloudIAM.iamRoleArn;
        if (iamRoleArn === undefined || iamRoleArn === null) {
            throw new BadRequestException([
                'A settings block that names no IAM role is invalid rather than a disconnect',
            ]);
        }
        if (iamRoleArn === '') {
            return { iamRoleArn: '', externalId: undefined };
        }
        await this.validateScraperRole(iamRoleArn, cloudIAM.externalId);
        return {
            iamRoleArn,
            externalId: cloudIAM.externalId,
        };
    }

    /**
     * Prove the scraper role can be assumed with the supplied external id
     * and that the returned credentials can read the instance inventory used by collection.
     */
    private async validateScraperRole(iamRoleArn: string, externalId?: string): Promise<void> {
        let credentials;
        try {
            credentials = await assumeRole(iamRoleArn, externalId);
        } catch (error) {
            SettingsService.logger.warn(
                `Failed to assume scraper IAM role ${iamRoleArn}: ${error instanceof Error ? error.message : error}`,
            );
            throw new BadRequestException([
                'Unable to assume the supplied IAM role with the provided external ID',
            ]);
        }
        try {
            await getInstanceWithFilters('us-east-1', credentials);
        } catch (error) {
            SettingsService.logger.warn(
                `Assumed scraper IAM role ${iamRoleArn} cannot read instance inventory: ${
                    error instanceof Error ? error.message : error
                }`,
            );
            throw new BadRequestException([
                'The assumed IAM credentials cannot read the instance inventory used by collection',
            ]);
        }
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

    async manageFreeTrial({ businessID, freeTrialStatus, expireTime }: FreeTrialDto): Promise<FreeTrialResponseDto> {
        const { loadPoints } = this.InfluxService;
        const freeTrialEntity = new FreeTrialEntity({ businessID, freeTrialStatus, expireTime });
        const dbModel = FreeTrialEntity.transformer(freeTrialEntity, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, dbModel);
        return FreeTrialResponseDto.fromEntity(freeTrialEntity);
    }

    async findFreeTrialInformation({ businessID }: { businessID: string }): Promise<FreeTrialResponseDto> {
        const freeTrialDBModels = await this.InfluxService.getLatestFreeTrial({ businessID });
        if (freeTrialDBModels.length > 0) {
            const freeTrialEntity = FreeTrialEntity.dbModelToEntity(freeTrialDBModels[0]);
            return FreeTrialResponseDto.fromEntity(freeTrialEntity);
        } else {
            // Defaults to no free trial
            return FreeTrialResponseDto.fromEntity(new FreeTrialEntity({ businessID }));
        }
    }

    async updateProfile({
        businessID,
        subject,
        ...updatedFileds
    }: UpdateProfileDto): Promise<{ data: ReadSettingsResponseData[]; message: string }> {
        SettingsService.logger.log('Updating platform settings');
        SettingsService.logger.log(JSON.stringify(updatedFileds));
        const [setting] = await this.findAll({ businessID });
        const { loadPoints } = this.InfluxService;
        const oldEntity = new SettingsEntity({ ...setting, businessID });
        const newEntity = new SettingsEntity({
            ...setting,
            ...updatedFileds,
            businessID,
        });
        const dbModel = SettingsEntity.transformer(newEntity, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-config`, process.env.INFLUX_ORG, dbModel);
        await SettingsEntity.handleSchedulerChanges(oldEntity, newEntity, this.schedulerService, subject);
        const responseDto = new ReadSettingsResponseData(newEntity);
        await cacheManager.set(businessID, JSON.stringify(responseDto), 604800);
        return { data: [responseDto], message: 'Business profile updated successfully' };
    }

    async getProfile({ businessID, subject }: { businessID: string; subject: string }): Promise<ReadProfileResponse> {
        const [setting] = await this.findAll({ businessID });
        return {
            message: 'Business profile found',
            data: [new ReadProfileResponseData(setting)],
        };
    }
}
