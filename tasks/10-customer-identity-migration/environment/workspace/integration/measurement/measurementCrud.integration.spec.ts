import { UsageRecordInS3Measurement } from '../client/publicClient/measurement';

describe('Measurement CRUD', () => {
    test('Get all measurements should return an array', async () => {
        const measurementClient = new UsageRecordInS3Measurement();
        const response = await measurementClient.getAll();
        expect(response).toEqual(expect.any(Array));
    });
});
