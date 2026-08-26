import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { BadRequestException } from '@nestjs/common';
import { proveScraperRoleCanBeAssumed } from '../utils/aws/scraperRole.js';

jest.mock('../utils/aws/scraperRole.js', () => {
    const actual = jest.requireActual('../utils/aws/scraperRole.js');
    return {
        ...actual,
        proveScraperRoleCanBeAssumed: jest.fn(),
    };
});

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
        (proveScraperRoleCanBeAssumed as jest.Mock).mockReset();
        (proveScraperRoleCanBeAssumed as jest.Mock).mockResolvedValue(undefined);
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
            expect(proveScraperRoleCanBeAssumed).not.toHaveBeenCalled();
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

        it('proves a scraper role can be assumed before writing', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            const cloudIAM = {
                iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper',
                externalId: 'ext-123',
            };

            const result = await service.update({ businessID, subject, cloudIAM, logoUrl: 'https://logo' });

            expect(proveScraperRoleCanBeAssumed).toHaveBeenCalledWith(cloudIAM);
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual(cloudIAM);
        });

        it('rejects an unassumable scraper role and writes nothing else in that save', async () => {
            (proveScraperRoleCanBeAssumed as jest.Mock).mockRejectedValue(
                new BadRequestException(['Unable to assume IAM role or read instance inventory with the supplied credentials']),
            );
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    businessName: 'must-not-persist',
                    cloudIAM: { iamRoleArn: 'arn:aws:iam::600000000042:role/unassumable', externalId: 'ext-123' },
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('treats a blank role as disconnect and clears the external id', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.update({
                businessID,
                subject,
                cloudIAM: { iamRoleArn: '', externalId: 'should-be-cleared' },
            });

            expect(proveScraperRoleCanBeAssumed).not.toHaveBeenCalled();
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({ iamRoleArn: '', externalId: '' });
        });

        it('rejects a settings block that names no role rather than disconnecting', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    businessName: 'must-not-persist',
                    cloudIAM: { externalId: 'ext-only' } as any,
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(proveScraperRoleCanBeAssumed).not.toHaveBeenCalled();
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
