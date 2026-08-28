import timeSeriesMockResponse from './resources/timeSeriesMockResponse';
import billingEngine from '../../../src/modules/billingEngine/billingEngine';
describe('billingEngine', () => {
    const validInput = {
        startDate: '2022-05-07T12:20:00Z',
        endDate: '2022-05-11T15:20:00Z',
        timeInterval: '60',
        dimensions: ['cpuUtilization'],
        pricingInformation: { cpuUtilization: { price: 0.7, timeInterval: '60' } },
        measuredUtilizationArray: timeSeriesMockResponse,
    };
    test('Should bill for cpu utilization correctly given the correct parameters', () => {
        const { startDate, pricingInformation, dimensions, measuredUtilizationArray } = validInput;
        const [
            {
                totalUtilization,
                dimension: returnedDimension,
                timeInterval: retrunedTimeInterval,
                startDate: returnedStartDate,
                price: returnedPrice,
                total,
            },
        ] = billingEngine(startDate, pricingInformation, dimensions, measuredUtilizationArray);
        const preCalculatedExpectedTotalUtilization = 0.7489302584051127;
        expect(startDate).toEqual(returnedStartDate);
        expect(pricingInformation.cpuUtilization.timeInterval).toEqual(retrunedTimeInterval);
        expect(dimensions[0]).toEqual(returnedDimension);
        expect(pricingInformation.cpuUtilization.price).toEqual(returnedPrice);
        expect(totalUtilization).toEqual(preCalculatedExpectedTotalUtilization);
        expect(total).toEqual(preCalculatedExpectedTotalUtilization * pricingInformation.cpuUtilization.price);
    });
});
