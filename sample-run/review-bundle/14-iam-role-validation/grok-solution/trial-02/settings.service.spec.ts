import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { BadRequestException } from '@nestjs/common';
import * as sts from '../utils/aws/sts.js';

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

    describe('prepareCloudIAMForSave', () => {
        it('should treat a blank role as a disconnect and clear the external id', async () => {
            const updatedFields: any = {
                cloudIAM: { iamRoleArn: '', externalId: 'keep-me' },
            };
            await SettingsService.prepareCloudIAMForSave(updatedFields);
            expect(updatedFields.cloudIAM).toEqual({ iamRoleArn: '', externalId: '' });
        });

        it('should reject a settings block that names no role', async () => {
            await expect(
                SettingsService.prepareCloudIAMForSave({ cloudIAM: { externalId: 'x' } } as any),
            ).rejects.toBeInstanceOf(BadRequestException);
            await expect(SettingsService.prepareCloudIAMForSave({ cloudIAM: {} } as any)).rejects.toBeInstanceOf(
                BadRequestException,
            );
        });

        it('should prove a non-blank role can be assumed before save', async () => {
            const spy = jest.spyOn(sts, 'proveScraperRoleCanCollect').mockResolvedValueOnce(undefined);
            await SettingsService.prepareCloudIAMForSave({
                cloudIAM: { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper', externalId: 'nw-7f31c2' },
            } as any);
            expect(spy).toHaveBeenCalledWith('arn:aws:iam::300000000011:role/meteringco-usage-scraper', 'nw-7f31c2');
            spy.mockRestore();
        });

        it('should not write settings when the scraper role cannot be assumed', async () => {
            jest.spyOn(sts, 'proveScraperRoleCanCollect').mockRejectedValueOnce(
                new BadRequestException(['Unable to assume the supplied IAM role with the given external id']),
            );
            const loadSpy = jest.spyOn(influxService, 'loadPoints');
            await expect(
                service.update({
                    businessID: 'some-business-id',
                    subject: 'some-subject',
                    cloudIAM: { iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper', externalId: 'wrong' },
                } as any),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(loadSpy).not.toHaveBeenCalled();
        });
    });
});
