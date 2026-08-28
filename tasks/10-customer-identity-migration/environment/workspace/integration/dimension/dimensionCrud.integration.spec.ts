import {
    AggregationInterval,
    AggregationMethod,
    Dimension,
    OverageAllowed,
    Rounding,
} from '../client/publicClient/dimension';
import { sleep } from '../utils/utils';

describe('dimension CRUD', () => {
    test('Get all dimensions should return an array', async () => {
        const dimensionClient = new Dimension();
        const response = await dimensionClient.getAll();
        expect(response).toEqual(expect.any(Array));
    });

    test('CREATE and DELETE should function correctly', async () => {
        const dimension = new Dimension();
        const dimensionId = await dimension.create({
            aggregationInterval: AggregationInterval.Hour,
            aggregationMethod: AggregationMethod.Sum,
            name: 'Request',
            consumptionPrice: '0.4',
            overageAllowed: OverageAllowed.False,
            usageEntitlement: 0,
            rounding: Rounding.Ceiling,
            usageIncrement: 1,
            consumptionUnit: {
                unit: 'count-based',
                type: 'count',
            },
        });
        expect(dimensionId).toEqual(expect.any(String));
        await sleep(1000);
        await dimension.delete();
        await sleep(1000);
        const res = (await Dimension.getByDimensionId(dimensionId)) as Response;
        expect(res.status).toEqual(404);
    });
});
