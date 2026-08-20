import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { BadRequestException } from '@nestjs/common';
import * as awsEc2 from '../utils/aws/awsEc2.js';

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
    });

    describe('prepareCloudIAM', () => {
        it('treats a blank role as disconnect and clears the external id', async () => {
            const result = await SettingsService.prepareCloudIAM({
                iamRoleArn: '',
                externalId: 'should-be-cleared',
            });
            expect(result).toEqual({ iamRoleArn: '', externalId: '' });
        });

        it('rejects a settings block that names no role', async () => {
            await expect(SettingsService.prepareCloudIAM({} as any)).rejects.toBeInstanceOf(BadRequestException);
            await expect(SettingsService.prepareCloudIAM(undefined)).rejects.toBeInstanceOf(BadRequestException);
            await expect(SettingsService.prepareCloudIAM(null)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('proves the role can be assumed and can read instance inventory before returning it', async () => {
            const assume = jest.spyOn(awsEc2, 'assumeScraperRole').mockResolvedValueOnce({
                AccessKeyId: 'ASIAEXAMPLE',
                SecretAccessKey: 'secret',
                SessionToken: 'token',
            } as any);
            const prove = jest.spyOn(awsEc2, 'proveInstanceInventoryAccess').mockResolvedValueOnce();

            const result = await SettingsService.prepareCloudIAM({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            });

            expect(assume).toHaveBeenCalledWith({
                roleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            });
            expect(prove).toHaveBeenCalled();
            expect(result).toEqual({
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            });
        });

        it('does not write when assume fails', async () => {
            jest.spyOn(awsEc2, 'assumeScraperRole').mockRejectedValueOnce(
                new BadRequestException('Invalid IAM role or external ID'),
            );
            await expect(
                SettingsService.prepareCloudIAM({
                    iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                    externalId: 'wrong',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('update with cloudIAM', () => {
        const businessID = 'some-business-id';
        const subject = 'some-subject';

        it('does not persist other fields when the scraper role cannot be assumed', async () => {
            jest.spyOn(SettingsService, 'prepareCloudIAM').mockRejectedValueOnce(
                new BadRequestException('Invalid IAM role or external ID'),
            );
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    logoUrl: 'https://example.com/logo.png',
                    cloudIAM: { iamRoleArn: 'wow a fake role', externalId: 'foobar' },
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('persists a disconnect that clears the external id', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.update({
                businessID,
                subject,
                cloudIAM: { iamRoleArn: '', externalId: 'leftover' },
            });

            expect(influxService.loadPoints).toHaveBeenCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({ iamRoleArn: '', externalId: '' });
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
