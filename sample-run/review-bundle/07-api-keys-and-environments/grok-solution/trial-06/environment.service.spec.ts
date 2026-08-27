import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-jest';
import { BadRequestException } from '@nestjs/common';
import { InfluxService } from '../influx/influx.service.js';
import { EnvironmentService } from './users.service.js';
import { Environment } from './dto/Environment.js';
import { UserEntity } from './entities/user.entity.js';
import { cache as cacheManager } from '../cacheStore.js';

jest.mock('../cacheStore');

describe('EnvironmentService.updateEnvironment', () => {
    let service: EnvironmentService;
    let mockLoadPoints: jest.Mock;
    let mockReadAllEnvironmentsForUser: jest.Mock;

    beforeEach(async () => {
        mockLoadPoints = jest.fn(async () => undefined);
        mockReadAllEnvironmentsForUser = jest.fn(async () => [
            {
                subject: 'auth0|opharborline77',
                businessID: 'harborline',
                environment: Environment.PRODUCTION,
            },
            {
                subject: 'auth0|opharborline77',
                businessID: 'harborline-sandbox',
                environment: Environment.SANDBOX,
            },
        ]);
        const module: TestingModule = await Test.createTestingModule({
            providers: [EnvironmentService],
        })
            .useMocker(createMock)
            .useMocker((token) => {
                if (token === InfluxService) {
                    return {
                        loadPoints: mockLoadPoints,
                        readAllEnvironmentsForUser: mockReadAllEnvironmentsForUser,
                        getPoint: () => ({ tag: jest.fn(), stringField: jest.fn() }),
                    };
                }
            })
            .compile();
        service = module.get<EnvironmentService>(EnvironmentService);
        (cacheManager.del as jest.Mock) = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('writes the new environment and clears the cached account', async () => {
        const result = await service.updateEnvironment('auth0|opharborline77', Environment.SANDBOX);
        expect(result.environment).toBe(Environment.SANDBOX);
        expect(mockLoadPoints).toHaveBeenCalledTimes(1);
        expect(cacheManager.del).toHaveBeenCalledWith('auth0|opharborline77');
    });

    it('refuses an environment the user does not have', async () => {
        mockReadAllEnvironmentsForUser.mockResolvedValueOnce([
            {
                subject: 'auth0|opharborline77',
                businessID: 'harborline',
                environment: Environment.PRODUCTION,
            },
        ]);
        await expect(service.updateEnvironment('auth0|opharborline77', Environment.SANDBOX)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(mockLoadPoints).not.toHaveBeenCalled();
    });
});
