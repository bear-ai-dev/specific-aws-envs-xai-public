import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { BadRequestException } from '@nestjs/common';

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

    describe('scraper role save', () => {
        const businessID = 'some-business-id';
        const subject = 'some-subject';
        const validRole = 'arn:aws:iam::300000000011:role/meteringco-usage-scraper';
        const validExternalId = 'nw-7f31c2';

        it('saves a role after proving assume and inventory read succeed', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            const result = await service.update({
                businessID,
                subject,
                cloudIAM: { iamRoleArn: validRole, externalId: validExternalId },
            });
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.message).toEqual('Setting updated successfully');
            expect(result.data[0].cloudIAM).toEqual({ iamRoleArn: validRole, externalId: validExternalId });
        });

        it('rejects a role that cannot be assumed and writes nothing', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            await expect(
                service.update({
                    businessID,
                    subject,
                    cloudIAM: { iamRoleArn: validRole, externalId: 'wrong-external-id' },
                    logoUrl: 'https://example.com/should-not-save.png',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('rejects assumed credentials that cannot read instance inventory and writes nothing', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            await expect(
                service.update({
                    businessID,
                    subject,
                    cloudIAM: {
                        iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-reports-reader',
                        externalId: 'nw-a01b',
                    },
                    logoUrl: 'https://example.com/should-not-save.png',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('treats a blank role as a disconnect and clears the external id', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            const result = await service.update({
                businessID,
                subject,
                cloudIAM: { iamRoleArn: '', externalId: 'should-be-cleared' },
            });
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({ iamRoleArn: '' });
            expect(result.data[0].cloudIAM.externalId).toBeUndefined();
        });

        it('rejects a settings block that names no role rather than treating it as a disconnect', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            await expect(
                service.update({
                    businessID,
                    subject,
                    cloudIAM: { externalId: 'nw-7f31c2' } as any,
                    logoUrl: 'https://example.com/should-not-save.png',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(influxService.loadPoints).not.toHaveBeenCalled();
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
