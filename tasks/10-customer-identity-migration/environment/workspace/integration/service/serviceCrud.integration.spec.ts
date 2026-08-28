import { Service } from '../client/publicClient/service';

describe('Service CRUD', () => {
    test('Get all Services should return an array', async () => {
        const serviceClient = new Service();
        const response = await serviceClient.getAll();
        expect(response).toEqual(expect.any(Array));
    });
});
