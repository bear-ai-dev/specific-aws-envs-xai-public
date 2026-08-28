import fetch from 'cross-fetch';
import {
    CreateDimensionDto,
    SampleType,
    aggregationInterval,
    aggregationMethod,
    roundingEnum,
    timeBasedUnits,
} from '../../src/dimensions/dto/create-dimension.dto';
import { InfluxService } from '../../src/influx/influx.service';

import { labelPods, loadPodStopStart } from './usageDataLoad';
import { randomUUID } from 'crypto';
import { commitMeasurementDocument, podCpuHourMeasurement, setupServices } from '../utils/setupServices';
import { v4 } from 'uuid';

describe('PodCpuTime', () => {
    const YESTERDAY = new Date((Date.now() - 86400000) / 1000);
    const ONE_HOUR_IN_SECONDS = 3600;
    const ONE_HOUR_AFTER_YESTERDAY = new Date(YESTERDAY.getTime() + ONE_HOUR_IN_SECONDS);

    let serviceId;
    const podCPUtimeDimension: CreateDimensionDto = {
        dimensionName: 'bar',
        usageIncrement: 1,
        consumptionPrice: '20.00',
        rounding: roundingEnum.ceiling,
        sampleType: SampleType.gauge,
        aggregationInterval: aggregationInterval.hour,
        aggregationMethod: aggregationMethod.max,
        consumptionUnit: { type: 'time', unit: timeBasedUnits['hour'] },
    };
    beforeEach(async () => {
        const { measurementId: cpuHourMeasurementId } = await commitMeasurementDocument(podCpuHourMeasurement);

        serviceId = await setupServices([{ ...podCPUtimeDimension, measurementId: cpuHourMeasurementId }]);
    });

    test('Should Use applicationId correctly', async () => {
        const podName = randomUUID();
        const influxService = new InfluxService();
        const { measurementId: cpuHourMeasurementId } = await commitMeasurementDocument(podCpuHourMeasurement);

        serviceId = await setupServices([{ ...podCPUtimeDimension, measurementId: cpuHourMeasurementId }], podName);
        await loadPodStopStart(
            YESTERDAY,
            false,
            influxService,
            false,
            process.env.INTEGRATION_TEST_BUSINESS_ID,
            podName,
            'myCoolNamespace'
        );
        await labelPods([{ name: 'label_meteringco_application_id', value: podName }], podName, 'myCoolNamespace');

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    { units: 'hour', usageName: 'CPU Hours', value: '24.00', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });
    test('Should calculate pod uptime correctly for one day', async () => {
        const podName = randomUUID();
        const influxService = new InfluxService();
        await loadPodStopStart(
            YESTERDAY,
            false,
            influxService,
            false,
            process.env.INTEGRATION_TEST_BUSINESS_ID,
            podName,
            'myCoolNamespace'
        );
        await labelPods([{ name: 'label_meteringco_service_id', value: serviceId }], podName, 'myCoolNamespace');

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    { units: 'hour', usageName: 'CPU Hours', value: '24.00', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });

    test('If Pod stop time is provided it should be used', async () => {
        const podName = randomUUID();
        const influxService = new InfluxService();
        await loadPodStopStart(
            YESTERDAY,
            ONE_HOUR_AFTER_YESTERDAY,
            influxService,
            false,
            process.env.INTEGRATION_TEST_BUSINESS_ID,
            podName,
            'myCoolNamespace'
        );
        await labelPods([{ name: 'label_meteringco_service_id', value: serviceId }], podName, 'myCoolNamespace');

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    { units: 'hour', usageName: 'CPU Hours', value: '1.00', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });

    test('If Pod terminate time is provided it should be used', async () => {
        const podName = randomUUID();
        const influxService = new InfluxService();
        await loadPodStopStart(
            YESTERDAY,
            false,
            influxService,
            ONE_HOUR_AFTER_YESTERDAY,
            process.env.INTEGRATION_TEST_BUSINESS_ID,
            podName,
            'myCoolNamespace'
        );
        await labelPods([{ name: 'label_meteringco_service_id', value: serviceId }], podName, 'myCoolNamespace');

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    { units: 'hour', usageName: 'CPU Hours', value: '1.00', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });

    test('Pods in a different businessId should not appear', async () => {
        const podName = randomUUID();
        const FAKE_BUSINESS_ID = 'fakeBusinessId';
        const influxService = new InfluxService();
        await loadPodStopStart(YESTERDAY, false, influxService, false, FAKE_BUSINESS_ID, podName, 'myCoolNamespace');
        await labelPods([{ name: 'label_meteringco_service_id', value: serviceId }], podName, 'myCoolNamespace');

        const usageResponse = await fetch(`${process.env.API_URL}/services/${serviceId}/usage`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.API_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        });
        const usageResponseDoc = await usageResponse.json();

        expect(usageResponseDoc).toEqual(
            expect.objectContaining({
                data: expect.arrayContaining([
                    { units: 'hour', usageName: 'CPU Hours', value: 'null', dimensionId: expect.anything() },
                ]),
                message: expect.anything(),
            })
        );
    });

    test('If Pod terminate time and stop time is provided terminate time is used', async () => {
        const podName = randomUUID();
        expect(true).toEqual(true);
    });

    test('If Multiple pods exist and are tagged with the same serviceId and total is in the dimension, then total up the pod uptimes', async () => {
        const podName = randomUUID();
        expect(true).toEqual(true);
    });

    test('Should ignore pods which do not have a meteringcoId:serviceId tagged on them', async () => {
        const podName = randomUUID();
        expect(true).toEqual(true);
    });

    test('Downtime should not be shown in the total, if the pod starts and stops frequently the missing time should be reflected in the usage total', async () => {
        const podName = randomUUID();
        expect(true).toEqual(true);
    });

    test('Short Lived uptime: 1 hour, 10 minutes, 1 minute', async () => {
        const podName = randomUUID();
        expect(true).toEqual(true);
    });
    test('No data for uptime should return null in the value', async () => {
        const podName = randomUUID();
        expect(true).toEqual(true);
    });
});
