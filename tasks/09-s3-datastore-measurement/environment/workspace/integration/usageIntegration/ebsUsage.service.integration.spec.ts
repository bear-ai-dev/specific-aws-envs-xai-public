import fetch from 'cross-fetch';
import {
    CreateDimensionDto,
    DatabasedConsumptionUnit,
    SampleType,
    aggregationInterval,
    aggregationMethod,
    dataBasedUnits,
    roundingEnum,
    timeBasedUnits,
} from '../../src/dimensions/dto/create-dimension.dto';
import { infrastructureType } from '../../src/dimensions/dto/create-dimension.dto';
import { loadUsageData } from './usageDataLoad';
import { InfluxService } from '../../src/influx/influx.service';
import {
    commitMeasurementDocument,
    retryAndBackoff,
    setupServices,
    ebsProvisionedVolumeMeasurementDto,
    ebsSnapshotMeasurementDto,
} from '../utils/setupServices';

describe('Ebs Usage on service', () => {
    const GENERATE_UNIQUE_IDS = true;
    const GENERATE_TIMESTAMPS_BEFORE_2003 = true;
    const EbsProvisionedCapacitydimensionDocumentInput: CreateDimensionDto = {
        dimensionName: 'bar',
        usageIncrement: 1,
        rounding: roundingEnum.ceiling,
        sampleType: SampleType.gauge,
        aggregationInterval: aggregationInterval.hour,
        aggregationMethod: aggregationMethod.max,
        consumptionPrice: '20.00',
        consumptionUnit: { type: 'data', unit: dataBasedUnits['gigabyte'] },
    };

    const EbsSnapshot: CreateDimensionDto = {
        dimensionName: 'bar',
        usageIncrement: 1,
        rounding: roundingEnum.ceiling,
        sampleType: SampleType.gauge,
        aggregationInterval: aggregationInterval.hour,
        aggregationMethod: aggregationMethod.max,
        consumptionPrice: '20.00',
        consumptionUnit: { type: 'data', unit: dataBasedUnits['gigabyte'] },
    };

    let serviceId;
    const getServiceDoc = async () => {
        const serviceDoc = await fetch(`${process.env.API_URL}/services/${serviceId}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        if (serviceDoc.status === 404) {
            throw new Error('Service not found');
        }
        return serviceDoc.json();
    };

    beforeEach(async () => {
        const { measurementId: provisionedVolumeMeasurementId } = await commitMeasurementDocument(
            ebsProvisionedVolumeMeasurementDto
        );

        const { measurementId: snapshotMeasurementId } = await commitMeasurementDocument(ebsSnapshotMeasurementDto);
        serviceId = await setupServices([
            { ...EbsProvisionedCapacitydimensionDocumentInput, measurementId: provisionedVolumeMeasurementId },
            { ...EbsSnapshot, measurementId: snapshotMeasurementId },
        ]);
    });
    test('Validiate endpoints function and usage data returns 404 when data is not found', async () => {
        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: 'null',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: 'null', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            
            })
        );
    });
    test('Validate Usage for snapshots and provisioned specification appears as expected', async () => {
        const influxService = new InfluxService();
        await loadUsageData(process.env.INTEGRATION_TEST_BUSINESS_ID, serviceId, influxService, false);

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '10',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '10', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            
            })
        );
    });
    test('Duplicate events for ebs volumes or snapshots shouldnt effect summation', async () => {
        const influxService = new InfluxService();
        await loadUsageData(process.env.INTEGRATION_TEST_BUSINESS_ID, serviceId, influxService, !GENERATE_UNIQUE_IDS);

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '10',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '10', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
          
            })
        );

        await loadUsageData(process.env.INTEGRATION_TEST_BUSINESS_ID, serviceId, influxService, !GENERATE_UNIQUE_IDS);

        const usageResponse2 = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        2;
        const usageResponseDoc2 = await usageResponse2.json();

        expect(usageResponseDoc2).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '10',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '10', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
      
            })
        );
    });

    test('Unique events for snapshots and ebs volumes should be aggregated based on associated dimension', async () => {
        const serviceResponse = await retryAndBackoff(getServiceDoc, 5, 1000);

        const {
            data: [
                {
                    offering: { dimensions },
                },
            ],
        } = serviceResponse;

        expect(dimensions.map(({ aggregationMethod }) => aggregationMethod)).toEqual(
            expect.arrayContaining(['max', 'max'])
        );
        const influxService = new InfluxService();
        await loadUsageData(process.env.INTEGRATION_TEST_BUSINESS_ID, serviceId, influxService, !GENERATE_UNIQUE_IDS);
        console.log(serviceId);
        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '10',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '10', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
        
            })
        );

        await loadUsageData(process.env.INTEGRATION_TEST_BUSINESS_ID, serviceId, influxService, GENERATE_UNIQUE_IDS);

        const usageResponse2 = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        2;
        const usageResponseDoc2 = await usageResponse2.json();

        expect(usageResponseDoc2).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '20',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '20', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
             
            })
        );
    });
    test('Unique events for snapshots and ebs volumes should be aggregated based on associated dimension', async () => {
        const serviceResponse = await retryAndBackoff(getServiceDoc, 5, 1000);
        const {
            data: [
                {
                    offering: { dimensions },
                },
            ],
        } = serviceResponse;

        expect(dimensions.map(({ aggregationMethod }) => aggregationMethod)).toEqual(
            expect.arrayContaining(['max', 'max'])
        );
        const influxService = new InfluxService();
        await loadUsageData(process.env.INTEGRATION_TEST_BUSINESS_ID, serviceId, influxService, !GENERATE_UNIQUE_IDS);

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '10',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '10', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );

        await loadUsageData(process.env.INTEGRATION_TEST_BUSINESS_ID, serviceId, influxService, GENERATE_UNIQUE_IDS);

        const usageResponse2 = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        2;
        const usageResponseDoc2 = await usageResponse2.json();

        expect(usageResponseDoc2).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '20',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '20', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });

    test('Many Unique events for snapshots and ebs volumes should be aggregated based on associated dimension', async () => {
        const serviceResponse = await retryAndBackoff(getServiceDoc, 5, 1000);

        const {
            data: [
                {
                    offering: { dimensions },
                },
            ],
        } = serviceResponse;

        expect(dimensions.map(({ aggregationMethod }) => aggregationMethod)).toEqual(
            expect.arrayContaining(['max', 'max'])
        );
        const influxService = new InfluxService();
        await Promise.all(
            [...Array(10 + 1).keys()].slice(1).map(async () => {
                await loadUsageData(
                    process.env.INTEGRATION_TEST_BUSINESS_ID,
                    serviceId,
                    influxService,
                    GENERATE_UNIQUE_IDS
                );
            })
        );

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '100',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '100', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });

    test('If Volume data is outisde of the 24 hour window range of last measurement it should not appear in response', async () => {
        const influxService = new InfluxService();
        await Promise.all(
            [...Array(10 + 1).keys()].slice(1).map(async () => {
                await loadUsageData(
                    process.env.INTEGRATION_TEST_BUSINESS_ID,
                    serviceId,
                    influxService,
                    GENERATE_UNIQUE_IDS,
                    GENERATE_TIMESTAMPS_BEFORE_2003
                );
            })
        );

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: 'null',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: 'null', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });
    test('Mixed volume data outside of 24 hour window and inside the window shouldnt interfere', async () => {
        const influxService = new InfluxService();
        await Promise.all(
            [...Array(2 + 1).keys()].slice(1).map(async () => {
                await loadUsageData(
                    process.env.INTEGRATION_TEST_BUSINESS_ID,
                    serviceId,
                    influxService,
                    GENERATE_UNIQUE_IDS,
                    GENERATE_TIMESTAMPS_BEFORE_2003
                );
                await loadUsageData(
                    process.env.INTEGRATION_TEST_BUSINESS_ID,
                    serviceId,
                    influxService,
                    GENERATE_UNIQUE_IDS,
                    !GENERATE_TIMESTAMPS_BEFORE_2003
                );
            })
        );

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    {
                        units: 'gigabyte',
                        usageName: 'Provisioned Capacity',
                        value: '20',
                        dimensionId: expect.anything(),
                    },
                    { units: 'gigabyte', usageName: 'Snapshots', value: '20', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });
});
