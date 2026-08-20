import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { createMock } from '@golevelup/ts-jest';
import { InfluxService } from '../influx/influx.service.js';
import { PortalPagesConfigurationDto } from '../portal/dto/configuration.dto.js';
import { BadRequestException } from '@nestjs/common';
import { assumeRole } from '../utils/aws/sts.js';
import { getInstanceWithFilters } from '../utils/aws/awsEc2.js';

jest.mock('../utils/aws/sts.js', () => ({
    assumeRole: jest.fn(),
}));
jest.mock('../utils/aws/awsEc2.js', () => ({
    getInstanceWithFilters: jest.fn(),
}));

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

        it('should persist a scraper role after assume and inventory checks succeed', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            (assumeRole as jest.Mock).mockResolvedValueOnce({
                accessKeyId: 'ASIAOK',
                secretAccessKey: 'secret',
                sessionToken: 'token',
            });
            (getInstanceWithFilters as jest.Mock).mockResolvedValueOnce([]);

            const result = await service.update({
                businessID,
                subject,
                cloudIAM: {
                    iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper-good',
                    externalId: 'ext-good',
                },
            });

            expect(assumeRole).toHaveBeenCalledWith(
                'arn:aws:iam::600000000042:role/meteringco-scraper-good',
                'ext-good',
            );
            expect(getInstanceWithFilters).toHaveBeenCalledTimes(1);
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({
                iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper-good',
                externalId: 'ext-good',
            });
        });

        it('should reject a role that cannot be assumed and write nothing else', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            (assumeRole as jest.Mock).mockRejectedValueOnce(new Error('AccessDenied'));

            await expect(
                service.update({
                    businessID,
                    subject,
                    logoUrl: 'https://example.com/should-not-save.png',
                    cloudIAM: { iamRoleArn: 'wow a fake role', externalId: 'foobar' },
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(getInstanceWithFilters).not.toHaveBeenCalled();
            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('should reject assumed credentials that cannot read instance inventory and write nothing', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();
            (assumeRole as jest.Mock).mockResolvedValueOnce({
                accessKeyId: 'ASIAOK',
                secretAccessKey: 'secret',
                sessionToken: 'token',
            });
            (getInstanceWithFilters as jest.Mock).mockRejectedValueOnce(new BadRequestException('Error fetching instances'));

            await expect(
                service.update({
                    businessID,
                    subject,
                    businessName: 'should-not-save',
                    cloudIAM: {
                        iamRoleArn: 'arn:aws:iam::600000000042:role/meteringco-scraper-nodesc',
                        externalId: 'ext-nodesc',
                    },
                }),
            ).rejects.toMatchObject({
                response: {
                    message: [
                        expect.stringContaining('instance inventory'),
                    ],
                },
            });
            expect(influxService.loadPoints).not.toHaveBeenCalled();
        });

        it('should treat a blank role as a disconnect and clear the external id', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            const result = await service.update({
                businessID,
                subject,
                cloudIAM: { iamRoleArn: '', externalId: 'should-be-cleared' },
            });

            expect(assumeRole).not.toHaveBeenCalled();
            expect(getInstanceWithFilters).not.toHaveBeenCalled();
            expect(influxService.loadPoints).toBeCalledTimes(1);
            expect(result.data[0].cloudIAM).toEqual({ iamRoleArn: '', externalId: undefined });
        });

        it('should reject a settings block that names no role instead of disconnecting', async () => {
            jest.spyOn(influxService, 'loadPoints').mockResolvedValueOnce();

            await expect(
                service.update({
                    businessID,
                    subject,
                    cloudIAM: { externalId: 'orphan-external-id' } as any,
                }),
            ).rejects.toMatchObject({
                response: {
                    message: [expect.stringContaining('names no IAM role')],
                },
            });
            expect(assumeRole).not.toHaveBeenCalled();
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
