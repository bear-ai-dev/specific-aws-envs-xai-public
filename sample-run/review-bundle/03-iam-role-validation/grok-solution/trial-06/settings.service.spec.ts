import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { BadRequestException } from '@nestjs/common';
import * as scraperRole from '../utils/aws/scraperRole.js';

describe('SettingService', () => {
    let service: SettingsService;
    let influxService: InfluxService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [SettingsService],
        })
            .useMocker(createMock)
            .compile();

        service = module.get(SettingsService);
        influxService = module.get(InfluxService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('findLatestSetting', () => {
        const businessID = 'some-business-id';
        const setting = {
            logoUrl: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
            businessID,
        };

        it('should return latest setting if it is available', async () => {
            jest.spyOn(influxService, 'getLatestSettings').mockResolvedValueOnce([setting]);

            const result = await service.findLatestSetting({ businessID });

            expect(result.logoUrl).toEqual(setting.logoUrl);
            expect(result.businessID).toEqual(setting.businessID);
        });

        it('should return new setting if the latest setting is unavailable', async () => {
            jest.spyOn(influxService, 'getLatestSettings').mockResolvedValueOnce([]);

            const result = await service.findLatestSetting({ businessID });

            expect(result.logoUrl).toEqual('');
            expect(result.businessID).toEqual(businessID);
        });
    });

    describe('update', () => {
        const businessID = 'some-business-id';
        const subject = 'some-subject';
        const fields = {
            logoUrl: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
        };

        it('should update setting', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.update({ businessID, subject, ...fields });
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.message).toEqual('Setting updated successfully');
        });
        it('Should handle portal configuration update', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const sampleRequest: PortalPagesConfigurationDto = {
                businessID: 'foobar',
                subject: 'foobar1',
                pages: {
                    invoice: {
                        text: 'invoice',
                        enabled: true,
                    },
                    payment: {
                        text: 'payment',
                        enabled: true,
                    },
                    offering: {
                        text: 'offerings',
                        enabled: true,
                        offerings: [],
                        appearance: {
                            background: '#ffffff',
                        },
                    },
                },
            };
            const result = await service.update(sampleRequest);
            expect(influxService.loadPoints).toBeCalledTimes(1);

            expect(result.message).toEqual('Setting updated successfully');
        });

        it('proves a scraper role before writing and persists the normalized credentials', async () => {
            const prepare = jest.spyOn(scraperRole, 'prepareCloudIamForSave').mockResolvedValueOnce({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            });
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.update({
                businessID,
                subject,
                cloudIAM: {
                    iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                    externalId: 'nw-7f31c2',
                },
            });

            expect(prepare).toHaveBeenCalledWith({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            });
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            });
            prepare.mockRestore();
        });

        it('does not write any settings when the role cannot be assumed or cannot read inventory', async () => {
            const prepare = jest
                .spyOn(scraperRole, 'prepareCloudIamForSave')
                .mockRejectedValueOnce(new BadRequestException(['Invalid IAM role or external ID']));
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    businessName: 'must not be written',
                    cloudIAM: { iamRoleArn: 'wow a fake role', externalId: 'foobar' },
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(influxService.loadPoints).not.toHaveBeenCalled();
            prepare.mockRestore();
        });

        it('clears the external id when a blank role disconnects', async () => {
            const prepare = jest.spyOn(scraperRole, 'prepareCloudIamForSave').mockResolvedValueOnce({ iamRoleArn: '' });
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.update({
                businessID,
                subject,
                cloudIAM: { iamRoleArn: '', externalId: 'should-be-cleared' },
            });

            expect(prepare).toHaveBeenCalledWith({ iamRoleArn: '', externalId: 'should-be-cleared' });
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({ iamRoleArn: '' });
            expect(result.data[0].cloudIAM.externalId).toBeUndefined();
            prepare.mockRestore();
        });

        it('rejects a settings block that names no role instead of treating it as a disconnect', async () => {
            const prepare = jest
                .spyOn(scraperRole, 'prepareCloudIamForSave')
                .mockRejectedValueOnce(new BadRequestException(['Invalid IAM role or external ID']));
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(service.update({ businessID, subject, cloudIAM: {} })).rejects.toBeInstanceOf(
                BadRequestException,
            );
            expect(influxService.loadPoints).not.toHaveBeenCalled();
            prepare.mockRestore();
        });
    });

    describe('updateProfile', () => {
        const businessID = 'some-business-id';
        const subject = 'some-subject';
        const fields = {
            addressLine1: '123 ABC Street',
            addressLine2: 'Suite 100',
            city: 'San Francisco',
            state: 'CA',
            country: 'USA',
            postalCode: '94188',
            supportEmail: 'abc@gmail.com',
        };

        it('should update business profile', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.updateProfile({ businessID, subject, ...fields });
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.message).toEqual('Business profile updated successfully');
        });
    });
});
