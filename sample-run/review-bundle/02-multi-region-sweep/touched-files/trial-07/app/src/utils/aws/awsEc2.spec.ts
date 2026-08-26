import { DescribeRegionsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import { getAllVolumes } from './awsEc2.js';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-ec2', () => {
    const actual = jest.requireActual('@aws-sdk/client-ec2');
    return {
        ...actual,
        EC2Client: jest.fn().mockImplementation(() => ({
            send: sendMock,
        })),
    };
});

describe('getAllVolumes', () => {
    beforeEach(() => {
        sendMock.mockReset();
    });

    it('sweeps enabled regions, keeps empty readable ones, retries rate limits, and omits unreadable or never-enabled regions', async () => {
        sendMock.mockImplementation(async (command) => {
            if (command instanceof DescribeRegionsCommand) {
                expect(command.input.AllRegions).toBe(true);
                return {
                    Regions: [
                        { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                        { RegionName: 'eu-west-1', OptInStatus: 'opt-in-not-required' },
                        { RegionName: 'sa-east-1', OptInStatus: 'opted-in' },
                        { RegionName: 'ap-south-1', OptInStatus: 'opted-in' },
                        { RegionName: 'me-south-1', OptInStatus: 'not-opted-in' },
                    ],
                };
            }

            if (command instanceof DescribeVolumesCommand) {
                const region = command.input.Filters ? undefined : undefined;
                // Region is on the client, not the command. Infer from call order via client constructor instead.
            }

            return { Volumes: [] };
        });

        // Track which region each client was constructed with and simulate per-region behavior
        const { EC2Client } = jest.requireMock('@aws-sdk/client-ec2');
        const constructedRegions: string[] = [];
        EC2Client.mockImplementation(({ region }) => {
            constructedRegions.push(region);
            let saEastAttempts = 0;
            return {
                send: async (command) => {
                    if (command instanceof DescribeRegionsCommand) {
                        expect(command.input.AllRegions).toBe(true);
                        return {
                            Regions: [
                                { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                                { RegionName: 'eu-west-1', OptInStatus: 'opt-in-not-required' },
                                { RegionName: 'sa-east-1', OptInStatus: 'opted-in' },
                                { RegionName: 'ap-south-1', OptInStatus: 'opted-in' },
                                { RegionName: 'me-south-1', OptInStatus: 'not-opted-in' },
                            ],
                        };
                    }

                    if (region === 'sa-east-1') {
                        saEastAttempts += 1;
                        if (saEastAttempts === 1) {
                            const err: any = new Error('Request limit exceeded');
                            err.Code = 'RequestLimitExceeded';
                            err.name = 'RequestLimitExceeded';
                            err.$metadata = { httpStatusCode: 503 };
                            throw err;
                        }
                        return { Volumes: [{ VolumeId: 'vol-saeast', Size: 8 }] };
                    }

                    if (region === 'ap-south-1') {
                        const err: any = new Error('You are not authorized to perform this operation in this Region');
                        err.Code = 'UnauthorizedOperation';
                        err.name = 'UnauthorizedOperation';
                        err.$metadata = { httpStatusCode: 403 };
                        throw err;
                    }

                    if (region === 'me-south-1') {
                        throw new Error('should never query a never-enabled region');
                    }

                    if (region === 'us-east-1') {
                        return { Volumes: [{ VolumeId: 'vol-useast', Size: 20 }] };
                    }

                    return { Volumes: [] };
                },
            };
        });

        const result = await getAllVolumes(undefined, []);

        expect(Object.keys(result).sort()).toEqual(['eu-west-1', 'sa-east-1', 'us-east-1']);
        expect(result['us-east-1']).toEqual([{ VolumeId: 'vol-useast', Size: 20 }]);
        expect(result['eu-west-1']).toEqual([]);
        expect(result['sa-east-1']).toEqual([{ VolumeId: 'vol-saeast', Size: 8 }]);
        expect(result).not.toHaveProperty('ap-south-1');
        expect(result).not.toHaveProperty('me-south-1');
        expect(constructedRegions).not.toContain('me-south-1');
    });

    it('does not let one permanently unreadable region collapse inventory from the rest', async () => {
        const { EC2Client } = jest.requireMock('@aws-sdk/client-ec2');
        EC2Client.mockImplementation(({ region }) => ({
            send: async (command) => {
                if (command instanceof DescribeRegionsCommand) {
                    return {
                        Regions: [
                            { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
                            { RegionName: 'eu-central-1', OptInStatus: 'opt-in-not-required' },
                        ],
                    };
                }
                if (region === 'eu-central-1') {
                    const err: any = new Error('AuthFailure');
                    err.Code = 'AuthFailure';
                    err.name = 'AuthFailure';
                    throw err;
                }
                return { Volumes: [{ VolumeId: 'vol-ok' }] };
            },
        }));

        const result = await getAllVolumes(undefined);
        expect(result).toEqual({
            'us-east-1': [{ VolumeId: 'vol-ok' }],
        });
        expect(result).not.toHaveProperty('eu-central-1');
    });
});
