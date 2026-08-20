import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { BadRequestException } from '@nestjs/common';
import { assumeRoleAndReadInstanceInventory } from '../utils/aws/sts.js';

jest.mock('../utils/aws/sts.js', () => ({
    assumeRoleAndReadInstanceInventory: jest.fn(),
}));

const mockedAssumeRoleAndReadInstanceInventory = assumeRoleAndReadInstanceInventory as jest.MockedFunction<
    typeof assumeRoleAndReadInstanceInventory
>;

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

        it('should prove a named scraper role before writing settings', async () => {
            mockedAssumeRoleAndReadInstanceInventory.mockResolvedValueOnce(undefined);
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const cloudIAM = {
                iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-usage-scraper',
                externalId: 'nw-7f31c2',
            };
            const result = await service.update({ businessID, subject, cloudIAM });

            expect(mockedAssumeRoleAndReadInstanceInventory).toHaveBeenCalledWith(
                cloudIAM.iamRoleArn,
                cloudIAM.externalId,
            );
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual(cloudIAM);
            expect(result.message).toEqual('Setting updated successfully');
        });

        it('should reject a scraper role that cannot be assumed and write nothing', async () => {
            mockedAssumeRoleAndReadInstanceInventory.mockRejectedValueOnce(new Error('AccessDenied'));
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    cloudIAM: { iamRoleArn: 'arn:aws:iam::300000000011:role/missing', externalId: 'foobar' },
                    logoUrl: 'https://example.com/should-not-be-written.png',
                }),
            ).rejects.toEqual(new BadRequestException(['Invalid IAM role or external ID']));

            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('should reject a role whose credentials cannot read instance inventory and write nothing', async () => {
            mockedAssumeRoleAndReadInstanceInventory.mockRejectedValueOnce(new Error('UnauthorizedOperation'));
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    cloudIAM: {
                        iamRoleArn: 'arn:aws:iam::300000000011:role/meteringco-reports-reader',
                        externalId: 'nw-a01b',
                    },
                }),
            ).rejects.toEqual(new BadRequestException(['Invalid IAM role or external ID']));

            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('should treat a blank role as a disconnect and clear the external id without assuming', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.update({
                businessID,
                subject,
                cloudIAM: { iamRoleArn: '', externalId: 'should-be-cleared' },
            });

            expect(mockedAssumeRoleAndReadInstanceInventory).not.toHaveBeenCalled();
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({ iamRoleArn: '', externalId: '' });
        });

        it('should reject a settings block that names no role rather than treat it as a disconnect', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    cloudIAM: { externalId: 'nw-7f31c2' } as any,
                    logoUrl: 'https://example.com/should-not-be-written.png',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(mockedAssumeRoleAndReadInstanceInventory).not.toHaveBeenCalled();
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
