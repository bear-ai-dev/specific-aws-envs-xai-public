// Given some fake usage documents for EBS Provisioned Capacity, Snapshots, and Uptime start stop time periods
// Load the documents through the API correctly
import { EbsVolumeDataGathererEntity } from '../../src/microservices/ebsVolumeDataGatherer/entities/ebsVolumeDataGatherer.entity';
import {
    KubeCompletionTimeInfluxRow,
    KubeDeletionTimeInfluxRow,
    KubeStartTimeInfluxRow,
} from '../../src/influx/entities/kubeStartStopCompleteTime.entity';
import { KubeLabelsInfluxRow } from '../../src/influx/entities/kubePodLabels.entity';
import { EbsSnapshotDataGathererEntity } from '../../src/microservices/ebsSnapshotDataGatherer/entities/ebsSnapshotDataGatherer.entity';
import { randomUUID } from 'crypto';
import { InfluxService } from '../../src/influx/influx.service';
import { Point } from '@influxdata/influxdb-client';

const loadEBSProvisionedVolume = async (
    businessID,
    serviceId,
    influxService,
    generateUniqueIds,
    generateDisperateDateRanges
) => {
    if (generateUniqueIds) {
        const entity = new EbsVolumeDataGathererEntity({
            volumeID: randomUUID(),
            businessID,
            size: 10,
            iops: 3000,
            volumeType: 'gp3',
            tags: [{ Key: 'meteringcoServiceId', Value: serviceId }],
            region: 'us-east-1',
            state: 'in-use',
            availabilityZone: 'us-east-1a',
            throughput: 125,
        });
        const points = EbsVolumeDataGathererEntity.transformer(entity, influxService);
        if (generateDisperateDateRanges) {
            points.timestamp(new Date(Math.floor(Math.random() * 1000000000000))); // Roughly any date before 2003
        }
        await influxService.loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, [points]);
    } else {
        const entity = new EbsVolumeDataGathererEntity({
            volumeID: '12345',
            businessID,
            size: 10,
            iops: 3000,
            volumeType: 'gp3',
            tags: [{ Key: 'meteringcoServiceId', Value: serviceId }],
            region: 'us-east-1',
            state: 'in-use',
            availabilityZone: 'us-east-1a',
            throughput: 125,
        });
        const points = EbsVolumeDataGathererEntity.transformer(entity, influxService);
        if (generateDisperateDateRanges) {
            points.timestamp(new Date(Math.floor(Math.random() * 1000000000000))); // Roughly any date before 2003
        }
        await influxService.loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, [points]);
    }
};

const loadEBSSnapshot = async (
    businessID,
    serviceId,
    influxService,
    generateUniqueIds,
    generateDisperateDateRanges
) => {
    if (generateUniqueIds) {
        const entity = new EbsSnapshotDataGathererEntity({
            volumeID: randomUUID(),
            businessID,
            size: 10,
            storageTier: 'standard',
            snapshotId: randomUUID(),
            snapshotOwnerID: randomUUID(),
            snapshotStartTime: new Date(),
            tags: [{ Key: 'meteringcoServiceId', Value: serviceId }],
        });
        const points = EbsSnapshotDataGathererEntity.transformer(entity, influxService);
        if (generateDisperateDateRanges) {
            points.timestamp(new Date(Math.floor(Math.random() * 1000000000000))); // Roughly any date before 2003
        }
        await influxService.loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, [points]);
    } else {
        const entity = new EbsSnapshotDataGathererEntity({
            volumeID: '12345',
            businessID,
            size: 10,
            storageTier: 'standard',
            snapshotId: 'tempSnapshotId',
            snapshotOwnerID: 'tempOwnerId',
            snapshotStartTime: new Date(),
            tags: [{ Key: 'meteringcoServiceId', Value: serviceId }],
        });
        const points = EbsSnapshotDataGathererEntity.transformer(entity, influxService);
        if (generateDisperateDateRanges) {
            points.timestamp(new Date(Math.floor(Math.random() * 1000000000000))); // Roughly any date before 2003
        }
        await influxService.loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, [points]);
    }
};

/**
 * Loads Start and Stop Times for Pods
 * @argument startTime - the startTime of the pod
 * @argument stopTime - the stop time of the pod, optional
 * @argument influxService - the service to connect to the DB
 * @argument terminated - if you want the pod to be terminated instead of a completed stop
 *
 */
export const loadPodStopStart = async (
    startTime: Date | false,
    stopTime: Date | false,
    influxService: InfluxService,
    terminatedTime: Date | false,
    businessID,
    podName = 'testPod',
    namespace = 'testNamespace'
) => {
    const points: Point[] = [];
    if (stopTime) {
        // Fill in the rest of the arguments for the KubeCompletionTimeInfluxRow class with resonable defaults

        const entity = new KubeCompletionTimeInfluxRow({
            pod: podName,
            namespace: namespace,
            uid: randomUUID(),
            businessID,
            job: 'testJob',
            _field: 'value',
            _value: stopTime.getTime(),
            __name__: 'kube_pod_completion_time',
            instance: 'testInstance',
        });
        const point = KubeCompletionTimeInfluxRow.transformer(entity, influxService);
        points.push(point[0]);
    }
    if (terminatedTime) {
        const entity = new KubeDeletionTimeInfluxRow({
            pod: podName,
            namespace: namespace,
            uid: randomUUID(),
            businessID,
            _field: 'value',
            _value: terminatedTime.getTime(),
            __name__: 'kube_pod_deletion_timestamp',
        });
        const point = KubeDeletionTimeInfluxRow.transformer(entity, influxService);
        points.push(point[0]);
    }
    // Completed
    if (startTime) {
        const entity = new KubeStartTimeInfluxRow({
            pod: podName,
            namespace: namespace,
            uid: randomUUID(),
            businessID,
            _field: 'value',
            _value: startTime.getTime(),
            __name__: 'kube_pod_start_time',
            instance: 'testInstance',
        });
        const point = KubeStartTimeInfluxRow.transformer(entity, influxService);
        points.push(point[0]);
    }

    await influxService.loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, points);
};

export const labelPods = async (
    labels: KubeLabelsInfluxRow['labels'],
    podName = 'testPodName',
    uid = randomUUID(),
    namespace = 'testNameSpace',
    businessID = process.env.INTEGRATION_TEST_BUSINESS_ID,
    influxService = new InfluxService()
) => {
    const entity = new KubeLabelsInfluxRow({
        pod: podName,
        namespace,
        uid,
        businessID,
        _field: 'value',
        _value: 1,
        __name__: 'kube_pod_labels',
        labels: labels,
    });
    const points = KubeLabelsInfluxRow.transformer(entity, influxService);
    await influxService.loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, points);
};
/**
 * Loads usage data for testing into dev influx
 * @argument businessID - the unqiue ID for a business using MeteringCo
 * @argument serviceId - the unique serviceId to use when loading data
 *
 */
export const loadUsageData = async (
    businessID = process.env.INTEGRATION_TEST_BUSINESS_ID,
    serviceId: string,
    influxService,
    generateUniqueIds: boolean,
    generateDisperateDateRanges = false
) => {
    await Promise.all([
        loadEBSProvisionedVolume(businessID, serviceId, influxService, generateUniqueIds, generateDisperateDateRanges),
        loadEBSSnapshot(businessID, serviceId, influxService, generateUniqueIds, generateDisperateDateRanges),
    ]);
    // Sleep
    await new Promise((resolve) => setTimeout(resolve, 4000));
};
