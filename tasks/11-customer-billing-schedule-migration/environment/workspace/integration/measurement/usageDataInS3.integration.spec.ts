import {
    setupCustomerWallStrTrading,
    setupDimensionRequest,
    setupS3Measurement,
    setupSimpleOffering,
    setupSimpleService,
} from '../setupAndTeardown/setup';
import { AggregationInterval } from '../client/publicClient/dimension';
import { getDocument, listDocuments, putDocument } from '../utils/s3';
import { sleep } from '../utils/utils';
import { ONE_OBJECT_INPUT } from './usageDataInS3.integration.input';
import { DLQ_INPUT } from './usageDataInS3.integration.input';
import { assumeRole } from '../utils/sts';

const TEST_1_ACCOUNT_ID: string = process.env.TEST_1_ACCOUNT_ID;
const TEST_2_ACCOUNT_ID: string = process.env.TEST_2_ACCOUNT_ID;
const regex = /s3:\/\/([a-zA-Z0-9-]+)\/(.*)/;

const constructPrefix = (root: string, randomize: boolean = true, path: boolean = true) => {
    const fullPath = path
        ? new Date()
              .toISOString()
              .split(/-|T|:|\./)
              .join('/')
        : new Date()
              .toISOString()
              .split(/-|T|:|\./)
              .join('');
    return `${root}/${fullPath}${randomize ? Math.round(Math.random() * 1000).toString() : ''}.txt`;
};

const printData = (measurement, customer, dimension, offering, service) => {
    console.debug('Print out resource data');
    console.debug('Measurement: ', JSON.stringify(measurement, null, 2));
    console.debug('Customer: ', JSON.stringify(customer, null, 2));
    console.debug('Dimension: ', JSON.stringify(dimension, null, 2));
    console.debug('Offering: ', JSON.stringify(offering, null, 2));
    console.debug('Service: ', JSON.stringify(service, null, 2));
};

describe('NDJSON Usage Data', () => {
    const largeObjectInput = [];
    for (let i = 0; i < 200; i++) {
        largeObjectInput.push(i.toString());
    }
    ONE_OBJECT_INPUT.push({ recordValues: largeObjectInput, expected: largeObjectInput });
    test.concurrent.each(ONE_OBJECT_INPUT)(
        'Validate NDJSON with input $recordValues',
        async ({ recordValues, expected }) => {
            const measurement = await setupS3Measurement(TEST_1_ACCOUNT_ID);
            const customer = await setupCustomerWallStrTrading();
            const dimension = await setupDimensionRequest(measurement.measurementId);
            const offering = await setupSimpleOffering([dimension.dimensionId]);
            const service = await setupSimpleService(offering.offeringId, customer.customerId);
            printData(measurement, customer, dimension, offering, service);
            const match = regex.exec(measurement.ingestion);
            const bucket = match[1];
            const key = match[2];
            await sleep(1000 * 10);
            const credentials = await assumeRole(
                measurement.iamRoleArn,
                measurement.externalId,
                measurement.region,
                process.env.TEST_1_AWS_ACCESS_KEY_ID,
                process.env.TEST_1_AWS_SECRET_ACCESS_KEY
            );
            let objectContent = '';
            let counter = recordValues.length + 1;
            for (const recordValue of recordValues) {
                objectContent +=
                    JSON.stringify({
                        applicationId: service.applicationId,
                        serviceId: service.serviceId,
                        dimensionId: dimension.dimensionId,
                        recordValue,
                        timeStamp: new Date(new Date().getTime() - 1000 * counter * 5).toISOString(),
                    }) + '\n';
                counter--;
            }
            const objectKey = constructPrefix(key);
            await putDocument(
                objectContent,
                bucket,
                objectKey,
                measurement.region,
                credentials.AccessKeyId,
                credentials.SecretAccessKey,
                credentials.SessionToken
            );
            await sleep(1000 * 60 * 3);
            // validating
            const serviceUsage = await service.getUsage(
                new Date(new Date().getTime() - 1000 * 60 * 60).toISOString(),
                new Date().toISOString(),
                AggregationInterval.None
            );
            console.debug('Service Usage: ', JSON.stringify(serviceUsage, null, 2));
            expect(serviceUsage[0].usage.length).toBe(expected.length);
            expected.forEach((expectedValue, index) => {
                expect(serviceUsage[0].usage[index].recordValue).toBe(expectedValue);
            });
            // DLQ
            if (expected.length < recordValues.length) {
                const dlqMatch = regex.exec(measurement.dlq);
                const dlqBucket = dlqMatch[1];
                const dlqKey = dlqMatch[2];
                const dlqMsgList = await listDocuments(
                    dlqBucket,
                    objectKey,
                    measurement.region,
                    credentials.AccessKeyId,
                    credentials.SecretAccessKey,
                    credentials.SessionToken
                );
                console.debug('DLQ Message List: ', JSON.stringify(dlqMsgList, null, 2));
                expect(dlqMsgList.Contents.length).toBe(recordValues.length - expected.length);
            }
        }
    );
});

describe('S3 Usage Data', () => {
    let measurement;
    let customer;
    let dimension;
    let offering;
    let service;
    let match;
    let bucket;
    let key;
    let credentials;

    beforeEach(async () => {
        measurement = await setupS3Measurement(TEST_1_ACCOUNT_ID);
        customer = await setupCustomerWallStrTrading();
        dimension = await setupDimensionRequest(measurement.measurementId);
        offering = await setupSimpleOffering([dimension.dimensionId]);
        service = await setupSimpleService(offering.offeringId, customer.customerId);
        match = regex.exec(measurement.ingestion);
        bucket = match[1];
        key = match[2];
        await sleep(1000 * 10);
        credentials = await assumeRole(
            measurement.iamRoleArn,
            measurement.externalId,
            measurement.region,
            process.env.TEST_1_AWS_ACCESS_KEY_ID,
            process.env.TEST_1_AWS_SECRET_ACCESS_KEY
        );
        printData(measurement, customer, dimension, offering, service);
    });

    test('Invalid AWS account number', async () => {
        await expect(setupS3Measurement()).rejects.toThrow();
    });

    test('Validate usage record under root', async () => {
        const recordValue = '22';
        let objectContent = JSON.stringify({
            timeStamp: new Date().toISOString(),
            applicationId: service.applicationId,
            serviceId: service.serviceId,
            dimensionId: dimension.dimensionId,
            recordValue,
        });
        const objectKey = constructPrefix(key, true, false);
        await putDocument(
            objectContent,
            bucket,
            objectKey,
            measurement.region,
            credentials.AccessKeyId,
            credentials.SecretAccessKey,
            credentials.SessionToken
        );
        // logstash runs every minute
        await sleep(1000 * 60 * 1.5);
        // validating
        const serviceUsage = await service.getUsage(
            new Date(new Date().getTime() - 1000 * 60 * 60).toISOString(),
            new Date().toISOString(),
            AggregationInterval.None
        );
        console.debug('Service Usage: ', JSON.stringify(serviceUsage, null, 2));
        expect(serviceUsage[0].usage.length).toBe(1);
        expect(serviceUsage[0].usage[0].recordValue).toBe(recordValue);
    });

    const largeObjectInput = [];
    for (let i = 0; i < 20; i++) {
        largeObjectInput.push(i.toString());
    }
    test('Validate multiple NDJSON', async () => {
        largeObjectInput.map(async (recordValue, index) => {
            const usageRecord = JSON.stringify({
                timeStamp: new Date(new Date().getTime() + (index + 1) * 1000).toISOString(),
                applicationId: service.applicationId,
                serviceId: service.serviceId,
                dimensionId: dimension.dimensionId,
                recordValue,
            });
            const objectKey = constructPrefix(key, true);
            await putDocument(
                usageRecord,
                bucket,
                objectKey,
                measurement.region,
                credentials.AccessKeyId,
                credentials.SecretAccessKey,
                credentials.SessionToken
            );
        });
        await sleep(1000 * 60 * 3);
        // validating
        const serviceUsage = await service.getUsage(
            new Date(new Date().getTime() - 1000 * 60 * 60).toISOString(),
            new Date().toISOString(),
            AggregationInterval.None
        );
        console.debug('Service Usage: ', JSON.stringify(serviceUsage, null, 2));
        expect(serviceUsage[0].usage.length).toBe(largeObjectInput.length);
        largeObjectInput.forEach((expectedValue, index) => {
            expect(serviceUsage[0].usage[index].recordValue).toBe(expectedValue);
        });
    });

    test('Validate measurement update', async () => {
        await measurement.update(TEST_2_ACCOUNT_ID);
        const recordValue = '171';
        let objectContent = JSON.stringify({
            timeStamp: new Date(new Date().getTime() + (1 + 1) * 1000).toISOString(),
            applicationId: service.applicationId,
            serviceId: service.serviceId,
            dimensionId: dimension.dimensionId,
            recordValue,
        });
        const objectKey = constructPrefix(key);
        await sleep(1000 * 10);
        const NewCredentials = await assumeRole(
            measurement.iamRoleArn,
            measurement.externalId,
            measurement.region,
            process.env.TEST_2_AWS_ACCESS_KEY_ID,
            process.env.TEST_2_AWS_SECRET_ACCESS_KEY
        );
        await putDocument(
            objectContent,
            bucket,
            objectKey,
            measurement.region,
            NewCredentials.AccessKeyId,
            NewCredentials.SecretAccessKey,
            NewCredentials.SessionToken
        );
        await sleep(1000 * 60 * 3);
        // validating
        const serviceUsage = await service.getUsage(
            new Date(new Date().getTime() - 1000 * 60 * 60).toISOString(),
            new Date().toISOString(),
            AggregationInterval.None
        );
        console.debug(`Validating measurement update ${JSON.stringify(serviceUsage, null, 2)}`);
        expect(serviceUsage[0].usage[serviceUsage[0].usage.length - 1].recordValue).toBe(recordValue);
    });

    test('Validate measurement deletion', async () => {
        await service.delete();
        await offering.delete();
        await dimension.delete();
        await customer.delete();
        await measurement.delete();
        await expect(measurement.get()).rejects.toThrow();
    });
});

describe('S3 DLQ', () => {
    let measurement;
    let customer;
    let dimension;
    let offering;
    let service;
    let match;
    let bucket;
    let key;
    let credentials;

    beforeAll(async () => {
        measurement = await setupS3Measurement(TEST_1_ACCOUNT_ID);
        customer = await setupCustomerWallStrTrading();
        dimension = await setupDimensionRequest(measurement.measurementId);
        offering = await setupSimpleOffering([dimension.dimensionId]);
        service = await setupSimpleService(offering.offeringId, customer.customerId);
        match = regex.exec(measurement.ingestion);
        bucket = match[1];
        key = match[2];
        await sleep(1000 * 10);
        credentials = await assumeRole(
            measurement.iamRoleArn,
            measurement.externalId,
            measurement.region,
            process.env.TEST_1_AWS_ACCESS_KEY_ID,
            process.env.TEST_1_AWS_SECRET_ACCESS_KEY
        );
        printData(measurement, customer, dimension, offering, service);
    });

    // Concurrent cannot be used with beforeAll, not supported by jest
    test.each(DLQ_INPUT)('Validate DLQ with input $content', async ({ content, items }) => {
        const objectKey = constructPrefix(key);
        await putDocument(
            content.toString(),
            bucket,
            objectKey,
            measurement.region,
            credentials.AccessKeyId,
            credentials.SecretAccessKey,
            credentials.SessionToken
        );
        console.debug('Object key: ', objectKey);
        // logstash runs every minute
        await sleep(1000 * 60 * 2);
        // validating
        const serviceUsage = await service.getUsage(
            new Date(new Date().getTime() - 1000 * 60 * 60).toISOString(),
            new Date().toISOString(),
            AggregationInterval.None
        );
        console.debug('Service Usage: ', JSON.stringify(serviceUsage, null, 2));
        expect(serviceUsage[0].usage.length).toBe(0);
        const dlqMatch = regex.exec(measurement.dlq);
        const dlqBucket = dlqMatch[1];
        const dlqKey = dlqMatch[2];
        const dlqMsgList = await listDocuments(
            dlqBucket,
            objectKey,
            measurement.region,
            credentials.AccessKeyId,
            credentials.SecretAccessKey,
            credentials.SessionToken
        );
        console.debug('DLQ Messages: ', JSON.stringify(dlqMsgList, null, 2));
        expect(dlqMsgList.Contents?.length).toBe(items);
        const dlqObjectContent = dlqMsgList.Contents?.[0];
        if (!dlqObjectContent) {
            throw new Error('missing content from object in DLQ');
        }
        const objectDLQDoc = await getDocument(
            dlqBucket,
            dlqObjectContent?.Key,
            measurement.region,
            credentials.AccessKeyId,
            credentials.SecretAccessKey,
            credentials.SessionToken
        );
        expect(objectDLQDoc.Body).toEqual(expect.anything());
    });
});
