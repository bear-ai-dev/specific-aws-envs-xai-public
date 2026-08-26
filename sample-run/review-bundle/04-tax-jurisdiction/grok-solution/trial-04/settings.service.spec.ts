import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { TaxCalculationType } from './dto/TaxCalculationType.js';
import * as taxjarUtil from '../invoice/taxjar.util.js';
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

    describe('tax settings', () => {
        const businessID = 'some-business-id';
        const subject = 'some-subject';

        it('should reject an invalid TaxJar API key', async () => {
            jest.spyOn(taxjarUtil, 'validateTaxJarApiKey').mockRejectedValueOnce(new Error('Unauthorized'));
            await expect(
                service.update({ businessID, subject, taxJarApiKey: 'wow a fake key!' }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('should reject meteringcoCalculated when no TaxJar key is configured', async () => {
            await expect(
                service.update({ businessID, subject, taxCalculationType: TaxCalculationType.meteringcoCalculated }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('should accept a valid TaxJar key with meteringcoCalculated', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            jest.spyOn(taxjarUtil, 'validateTaxJarApiKey').mockResolvedValueOnce();
            const result = await service.update({
                businessID,
                subject,
                taxCalculationType: TaxCalculationType.meteringcoCalculated,
                taxJarApiKey: 'tjk_sbx_northwind_a41f',
            });
            expect(taxjarUtil.validateTaxJarApiKey).toHaveBeenCalledWith('tjk_sbx_northwind_a41f', expect.anything());
            expect(result.message).toEqual('Setting updated successfully');
        });
    });

});
