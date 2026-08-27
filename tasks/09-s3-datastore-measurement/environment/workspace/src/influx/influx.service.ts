import { Injectable, Logger } from '@nestjs/common';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { DeleteAPI } from '@influxdata/influxdb-client-apis';
import { InfluxQueryDimenisonDTO, InfluxQueryPricingConfigDTO } from './dto/influxQueryDTO';
import { OfferingPackageEntity } from '../offering/entities/offeringPackage.entity';
import { ServiceEntity } from '../services/entities/service.entity';
import { aggregationType, DimensionEntity, Numerical } from '../dimensions/entities/dimensions.entity';
import { MeasurementEntity } from '../measurement/entities/measurement.entity';
import { FeatureRequestEntity } from '../featureRequest/entities/featureRequest.entity';
import { InstanceUptimeEntity } from '../microservices/instanceUpTime/entities/instanceUptime.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CustomerEntity } from '../customer/entities/customer.entity';
import { SchedulerEntity } from '../scheduler/entities/scheduler.entity';
import { OfferingInfluxRow } from './entities/offeringInfluxTable.entity';
import { ReadDimensionDto } from '../dimensions/dto/read-dimension.dto';
import { MeteringCoFilters } from '../measurement-config/entities/measurement-config.entity';
import { MeasurementConfigEntity } from '../measurement-config/entities/measurement-config.entity';
import { InfluxAggregateUsageEvent } from './influxUsageAggregateEvent';
import { UsageDocument } from '../usage/dto/read-usage.dto';
import { EbsVolumeDataGathererEntity } from '../microservices/ebsVolumeDataGatherer/entities/ebsVolumeDataGatherer.entity';
import { EBSSnapshot, EBSVolumeProvisionedCapacity } from './entities/ebsVolume.entity';
import { UserTable } from './entities/userTable.entity';
import { CalculatedEbsCostEntity } from '../cost/entities/ebsCost.entity';
import { EBSStorageCostEntity } from './entities/ebsStorageCostEntity';
import { ReservedInstanceEntity } from '../microservices/reservedInstanceHistory/entities/reservedInstances.entity';
import { EC2CostEntity } from '../cost/entities/ec2Cost.entity';
import { EC2CostInfluxRow } from './entities/ec2CostStorage.entity';
import { SettingsEntity } from '../setting/entities/settings.entity';
import { ServiceInfluxRow } from './entities/serviceInfluxTable.entity';
import { SettingInfluxRow } from './entities/settingsInfluxTable.entity';
import { EbsSnapshotDataGathererEntity } from '../microservices/ebsSnapshotDataGatherer/entities/ebsSnapshotDataGatherer.entity';
import { Invoice } from '../invoice/entities/invoice.entity';
import { InvoiceInfluxRow } from './entities/InvoiceInfluxTable.entity';
import { ebsVolumeAggregationEntityRow } from './entities/aggregatedEBSVolume.entity';
import { ebsSnapshotAggregationEntityRow } from './entities/aggregatedEBSSnapshot.entity';
import { uptimeAggregationInfluxRow } from './entities/aggregatedPodUptime.entity';
import { MonthlyCostInfluxRow } from './entities/monthlyCostInfluxRow';
import { Inbox } from '../inbox/entities/inbox.entity';
import { aggregationInterval, aggregationMethod } from '../dimensions/dto/create-dimension.dto';
import { UsageEntity } from '../usage/entities/usage.entity';
import { AggregatedUsageResponse, UnAggregatedUsageResponse } from '../services/dto/readService.dto';
import { LabelPodInfluxRow } from './entities/labelPodInfluxRow.entity';

@Injectable()
export class InfluxService {
    private static readonly logger = new Logger(InfluxService.name);
    url: string;
    token: string;
    org: string;
    bucket: string;
    dbclient: InfluxDB;
    constructor() {
        this.url = process.env.INFLUX_URL || 'https://us-east-1-1.aws.cloud2.influxdata.com';
        this.token = process.env.INFLUX_TOKEN || '';
        this.org = process.env.INFLUX_ORG || 'meteringco';
        this.dbclient = new InfluxDB({ url: this.url, token: this.token, timeout: 20000 }); // 20 second timeout for requests});
    }

    queryAPIInstance() {
        return this.dbclient.getQueryApi(this.org);
    }
    readMeasurementConfigData = async ({ measurementId, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const measurementConfigFluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${MeasurementConfigEntity._measurement}")
        |> filter(fn: (r) => exists r.measurementId)
        |> filter(fn: (r) => r["measurementId"] == "${measurementId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "measurementId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        InfluxService.logger.debug(measurementConfigFluxQuery);

        const res = queryApi.collectRows<{ [x: string]: any }>(measurementConfigFluxQuery);

        return res;
    };
    readAggregateUsage = async ({ businessID, dimensionId, startTime, endTime }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        const measurementConfigFluxQuery = `from(bucket: "${process.env.STAGE}-aggregate-usage")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => exists r.startTime)
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["dimensionId"] == "${dimensionId}")
        |> group(columns: ["_measurement"], mode:"by")
        |> unique(column: "startTime")
        |> sort(columns: ["startTime"], desc: false)
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        const res = queryApi.collectRows<
            ebsVolumeAggregationEntityRow | ebsSnapshotAggregationEntityRow | uptimeAggregationInfluxRow
        >(measurementConfigFluxQuery);

        return res;
    };
    readAllMeaurements = async ({ businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const measurementConfigFluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${MeasurementConfigEntity._measurement}")
        |> filter(fn: (r) => exists r.measurementId)
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "measurementId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        InfluxService.logger.debug(measurementConfigFluxQuery);

        const res = queryApi.collectRows<{ [x: string]: any }>(measurementConfigFluxQuery);

        return res;
    };

    aggregateDimensionUsageQuery = async ({
        businessID,
        dimensionId,
        aggregationMethod,
        aggregationInterval,
        startDate,
        endDate,
        serviceId,
        applicationId,
    }: {
        businessID: string;
        dimensionId: string;
        aggregationMethod: aggregationMethod;
        aggregationInterval: aggregationInterval;
        startDate: Date;
        endDate: Date;
        serviceId?: string;
        applicationId?: string;
    }) => {
        if (applicationId) {
            const queryApi = this.dbclient.getQueryApi(this.org);
            const dimensionAggregationFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${startDate.toISOString()}, stop:${endDate.toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["dimensionId"] == "${dimensionId}")
        |> filter(fn: (r) => r["applicationId"] == "${applicationId}" or r["serviceId"] == "${serviceId}")
        |> filter(fn: (r) => r["_measurement"] == "${UsageEntity._measurement}")
        |> group(columns: ["_measurement"], mode:"by")
        |> aggregateWindow(every: ${this.aggregationIntervalToInfluxQueryLine(
            aggregationInterval
        )}, fn: ${this.aggregationMethodToQueryLine(aggregationMethod)}, createEmpty: true) 
        |> sort(columns: ["_time"], desc: false)
        `;
            InfluxService.logger.debug(dimensionAggregationFluxQuery);
            const res = queryApi.collectRows<any>(dimensionAggregationFluxQuery);

            return res;
        } else {
            const queryApi = this.dbclient.getQueryApi(this.org);
            const dimensionAggregationFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${startDate.toISOString()}, stop:${endDate.toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["dimensionId"] == "${dimensionId}")
        |> filter(fn: (r) => r["serviceId"] == "${serviceId}")
        |> filter(fn: (r) => r["_measurement"] == "${UsageEntity._measurement}")
        |> group(columns: ["_measurement"], mode:"by")
        |> aggregateWindow(every: ${this.aggregationIntervalToInfluxQueryLine(
            aggregationInterval
        )}, fn: ${this.aggregationMethodToQueryLine(aggregationMethod)}, createEmpty: true)
        |> sort(columns: ["_time"], desc: false)
        `;
            InfluxService.logger.debug(dimensionAggregationFluxQuery);
            const res = queryApi.collectRows<any>(dimensionAggregationFluxQuery);

            return res;
        }
    };

    dimensionUsageNoAggregation = async ({
        businessID,
        dimensionId,
        startDate,
        endDate,
        serviceId,
        applicationId,
    }: {
        businessID: string;
        dimensionId: string;
        startDate: Date;
        endDate: Date;
        serviceId?: string;
        applicationId?: string;
    }) => {
        if (applicationId) {
            const queryApi = this.dbclient.getQueryApi(this.org);
            const dimensionAggregationFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${startDate.toISOString()}, stop:${endDate.toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["dimensionId"] == "${dimensionId}")
        |> filter(fn: (r) => r["applicationId"] == "${applicationId}" or r["serviceId"] == "${serviceId}")
        |> filter(fn: (r) => r["_measurement"] == "${UsageEntity._measurement}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: false)
        `;
            InfluxService.logger.debug(dimensionAggregationFluxQuery);
            const res = queryApi.collectRows<any>(dimensionAggregationFluxQuery);

            return res;
        } else {
            const queryApi = this.dbclient.getQueryApi(this.org);
            const dimensionAggregationFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${startDate.toISOString()}, stop:${endDate.toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["dimensionId"] == "${dimensionId}")
        |> filter(fn: (r) => r["serviceId"] == "${serviceId}")
        |> filter(fn: (r) => r["_measurement"] == "${UsageEntity._measurement}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: false)
        `;
            InfluxService.logger.debug(dimensionAggregationFluxQuery);
            const res = queryApi.collectRows<any>(dimensionAggregationFluxQuery);

            return res;
        }
    };
    private aggregationMethodToQueryLine(aggMethod: aggregationMethod) {
        switch (aggMethod) {
            case 'sum':
                return 'sum';
            case 'average':
                return 'mean';
            case 'min':
                return 'min';
            case 'max':
                return 'max';
            case 'count':
                return 'count';
        }
    }
    private aggregationIntervalToInfluxQueryLine(aggregationInterval: aggregationInterval) {
        switch (aggregationInterval) {
            case 'hour':
                return '1h';
            case 'day':
                return '1d';
        }
    }
    readAllEBSVolumesForAService = async ({ serviceId, businessID, applicationId }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        let ebsVolumeFluxQuery;
        if (applicationId) {
            ebsVolumeFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${EbsVolumeDataGathererEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["tag_meteringcoServiceId"] == "${serviceId}" or r["tag_meteringcoApplicationId"] == "${applicationId}" )
        |> filter(fn: (r) => exists r.state)
        |> filter(fn: (r) => r["state"] == "in-use" or r["state"] == "available")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column:"volumeID")`;
        } else {
            ebsVolumeFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${EbsVolumeDataGathererEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["tag_meteringcoServiceId"] == "${serviceId}")
        |> filter(fn: (r) => exists r.state)
        |> filter(fn: (r) => r["state"] == "in-use")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column:"volumeID")`;
        }
        InfluxService.logger.debug(ebsVolumeFluxQuery);

        const res = queryApi.collectRows<EBSVolumeProvisionedCapacity>(ebsVolumeFluxQuery);

        return res;
    };

    getMeteringCoTaggedMaxEbsVolumeMeasurementInTimeRange = async ({ businessID, startTime, endTime }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const measurementConfigFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${EbsVolumeDataGathererEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.state)
        |> filter(fn: (r) => r["state"] == "in-use" or r["state"] == "available")
        |> filter(fn: (r) => exists r.tag_meteringcoServiceId or exists r.tag_meteringcoApplicationId)
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column:"volumeID")`;

        InfluxService.logger.debug(measurementConfigFluxQuery);

        const res = queryApi.collectRows<EBSVolumeProvisionedCapacity>(measurementConfigFluxQuery);

        return res;
    };
    getMeteringCoTaggedMaxEbsSnapshotMeasurementInTimeRange = async ({ businessID, startTime, endTime }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const snapshotQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${EbsSnapshotDataGathererEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.tag_meteringcoServiceId or exists r.tag_meteringcoApplicationId)
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column:"snapshotId")`;

        InfluxService.logger.debug(snapshotQuery);

        const res = queryApi.collectRows<EBSSnapshot>(snapshotQuery);

        return res;
    };
    readAverageEBSCost({ businessID }) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const averageEBSCostFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${CalculatedEbsCostEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.volumeType)
        |> group(columns: ["volumeType", "businessID", "iops", "storageSize", "throughput"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> mean()`;

        const res = queryApi.collectRows<EBSStorageCostEntity>(averageEBSCostFluxQuery);

        return res;
    }

    readAverageEC2Cost({ businessID }) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const averageEC2CostFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${EC2CostEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["cpu", "ram"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> mean()`;
        InfluxService.logger.debug(averageEC2CostFluxQuery);

        const res = queryApi.collectRows<EC2CostInfluxRow>(averageEC2CostFluxQuery);

        return res;
    }
    readMeasurementConfigDataByDimensionId = async ({ dimensionId, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const measurementConfigFluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${MeasurementConfigEntity._measurement}")
        |> filter(fn: (r) => exists r.measurementId)
        |> filter(fn: (r) => r["dimensionId_${dimensionId}"] == "${dimensionId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "measurementId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        InfluxService.logger.debug(measurementConfigFluxQuery);

        const res = queryApi.collectRows<{ [x: string]: any }>(measurementConfigFluxQuery);

        return res;
    };
    readUserData = async (subject) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        // Query range for all time. needed for tsdb query cant give unbounded range
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${UserEntity._measurement}")
        |> filter(fn: (r) => r["subject"] == "${subject}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "subject")`;

        const res = queryApi.collectRows<{ businessID: string }>(fluxQuery);
        return res;
    };

    readAllBusinesses = async () => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        // Query range for all time. needed for tsdb query cant give unbounded range
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${UserEntity._measurement}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "businessID")`;

        const res = queryApi.collectRows<UserTable>(fluxQuery);
        return res;
    };
    dropDimensionConfig = async (bucket: string, org: string = this.org, businessID: string, dimensionId: string) => {
        const deleteClient = new DeleteAPI(this.dbclient);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        InfluxService.logger.warn('Deleting Dimension From DB', {
            businessID,
            dimensionId,
            org,
            bucket,
        });
        const response = deleteClient.postDelete({
            bucket,
            org,
            body: {
                start: startDate.toISOString(),
                stop: endDate.toISOString(),
                predicate: `_measurement="${DimensionEntity._measurement}" AND businessID="${businessID}" AND dimensionId="${dimensionId}"`,
            },
        });
        return response;
    };
    queryDimension = async ({ _measurement, serviceId, businessID, startDate, endDate }: InfluxQueryDimenisonDTO) => {
        const queryApi = this.dbclient.getQueryApi(this.org);

        const fluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${_measurement}")
        |> filter(fn: (r) => r["meteringco-id"] == "${serviceId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")`;

        const res = queryApi.collectRows(fluxQuery);
        return res;
    };
    getReservedInstances = async ({ businessID }: { businessID: string }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const reservedInstanceQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${ReservedInstanceEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "reservedInstancesId")`;
        const res = queryApi.collectRows(reservedInstanceQuery);

        return res;
    };

    getAggregateUsageForDimension = async (
        aggregateEvent: InfluxAggregateUsageEvent
    ): Promise<AggregatedUsageResponse[] | UnAggregatedUsageResponse[]> => {
        InfluxService.logger.debug('aggregate usage event');
        InfluxService.logger.debug(aggregateEvent);
        return InfluxAggregateUsageEvent.buildAggregationQueries(aggregateEvent) as Promise<
            AggregatedUsageResponse[] | UnAggregatedUsageResponse[]
        >;
    };
    getLatestOfferingConfig = async ({
        businessID,
        offeringId,
    }: InfluxQueryPricingConfigDTO): Promise<Array<OfferingInfluxRow | Record<string, any>>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const priceDocumentFluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${OfferingPackageEntity._measurement}")
        |> filter(fn: (r) => exists r.offeringId)
        |> filter(fn: (r) => r["offeringId"] == "${offeringId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "offeringId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        InfluxService.logger.debug(priceDocumentFluxQuery);

        const res = queryApi.collectRows<OfferingInfluxRow>(priceDocumentFluxQuery);

        return res;
    };

    getAllOfferingIdsByDimensionId = async ({ dimensionId, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const offeringFluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${OfferingPackageEntity._measurement}")
        |> filter(fn: (r) => exists r.offeringId)
        |> filter(fn: (r) => r["dimensionId_${dimensionId}"] == "${dimensionId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "offeringId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        InfluxService.logger.debug(offeringFluxQuery);
        const res = queryApi.collectRows<OfferingInfluxRow>(offeringFluxQuery);

        return res;
    };
    getAllServicesByOfferingId = async ({ offeringId, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const serviceFluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${ServiceEntity._measurement}")
        |> filter(fn: (r) => exists r.offeringId)
        |> filter(fn: (r) => r["offeringId"] == "${offeringId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "serviceId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        InfluxService.logger.debug(serviceFluxQuery);
        const res = queryApi.collectRows<ServiceInfluxRow>(serviceFluxQuery);

        return res;
    };
    getLatestEC2InstanceState = async ({ instanceID, businessID }): Promise<Array<{ _value?: string }>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const instanUptimeFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${InstanceUptimeEntity._measurement}")
        |> filter(fn: (r) => r["instanceID"] == "${instanceID}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "instanceID")`;
        const results = queryApi.collectRows(instanUptimeFluxQuery);
        return results;
    };
    getEC2InstanceData = async ({ privateDNS, businessID }): Promise<Array<{ _value?: string }>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const instanceUptimeFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${InstanceUptimeEntity._measurement}")
        |> filter(fn: (r) => r["privateDNS"] == "${privateDNS}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "privateDNS")`;
        InfluxService.logger.debug(instanceUptimeFluxQuery);
        const results = queryApi.collectRows(instanceUptimeFluxQuery);
        return results;
    };

    getLatestCustomers({ businessID }) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const customerQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${CustomerEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.customerId)
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "customerId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")
        `;
        const results = queryApi.collectRows(customerQuery);
        return results;
    }
    findApplicationId = ({ applicationId, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const customerQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${ServiceEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["applicationId"] == "${applicationId}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "serviceId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")
        `;
        const results = queryApi.collectRows<ServiceInfluxRow>(customerQuery);
        return results;
    };

    getAllScheduledActions({ businessID }) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const customerQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${SchedulerEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "schedulerID")
        |> filter(fn: (r) => r._value != "inactive")
        `;
        const results = queryApi.collectRows(customerQuery);
        return results;
    }
    getAScheduledAction({ businessID, schedulerID }) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const customerQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${SchedulerEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["schedulerID"] == "${schedulerID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "schedulerID")
        |> filter(fn: (r) => r._value != "inactive")
        `;
        const results = queryApi.collectRows(customerQuery);
        return results;
    }
    getLatestCustomer({ businessID, customerId }) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const customerQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${CustomerEntity._measurement}")
        |> filter(fn: (r) => exists r.customerId)
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["customerId"] == "${customerId}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "customerId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")
        `;
        const results = queryApi.collectRows(customerQuery);
        return results;
    }

    getAllOfferingIds = async ({ businessID }): Promise<Array<any>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${OfferingPackageEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.offeringId)
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "offeringId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        const res = queryApi.collectRows(fluxQuery);
        return res;
    };
    getAllDimensionIds = async ({ businessID }): Promise<Array<any>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${DimensionEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.dimensionId)
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "dimensionId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        const res = queryApi.collectRows(fluxQuery);
        return res;
    };
    getAllDimensionIdsWithMeasurementId = async ({ businessID, measurementId }): Promise<Array<any>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${DimensionEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.dimensionId)
        |> filter(fn: (r) => r["measurementId"] == "${measurementId}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "dimensionId")
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")`;

        const res = queryApi.collectRows(fluxQuery);
        return res;
    };

    getFeatureSumByName = async (featureName: string): Promise<Array<any>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${FeatureRequestEntity._measurement}")
        |> filter(fn: (r) => r["featureName"] == "${featureName}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sum(column: "_value")`;
        const res = queryApi.collectRows(fluxQuery);
        return res;
    };

    loadPoints = async (bucket: string, org: string = this.org, data: Array<Point>) => {
        const writeApi = this.dbclient.getWriteApi(org, bucket);
        writeApi.writePoints(data);

        return writeApi.close();
    };
    getPoint = (measurement: string): Point => {
        return new Point(measurement);
    };

    dropPricingConfig = async (bucket: string, org: string = this.org, businessID: string, offeringId: string) => {
        const deleteClient = new DeleteAPI(this.dbclient);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        InfluxService.logger.warn('Deleting Price Document from DB', { businessID, offeringId, org, bucket });
        const response = deleteClient.postDelete({
            bucket,
            org,
            body: {
                start: startDate.toISOString(),
                stop: endDate.toISOString(),
                predicate: `_measurement="${OfferingPackageEntity._measurement}" AND businessID="${businessID}" AND offeringId="${offeringId}"`,
            },
        });
        return response;
    };

    getSingleService(measurement, businessID, serviceId) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["serviceId"] == "${serviceId}")
        |> group(columns: ["serviceId"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        ${InfluxService.fillUniqueColumn('serviceId')}`;
        const res = queryApi.collectRows(fluxQuery);
        return res;
    }

    getAllServicesWithofferingId(measurement, businessID, offeringId) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${measurement}")
        |> filter(fn: (r) => r["offeringId"] == "${offeringId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["serviceId"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        ${InfluxService.fillUniqueColumn('serviceId')}
        
        `;

        const res = queryApi.collectRows(fluxQuery);
        return res;
    }

    getAllServicesWithCustomerId(measurement, businessID, customerId) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${measurement}")
        |> filter(fn: (r) => r["customerId"] == "${customerId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["serviceId"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        ${InfluxService.fillUniqueColumn('serviceId')}
        |> filter(fn: (r) => not exists r.softDelete or r.softDelete != "deleted")
        `;

        const res = queryApi.collectRows(fluxQuery);
        return res;
    }
    getAllElementsFromTableForBusiness(measurement, businessID, unqiueColumn = '') {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        let fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")`;
        if (unqiueColumn) {
            // Group and sort by the unique column ID, IE: get the last change in the ledger for the column
            fluxQuery =
                fluxQuery +
                `|> group(columns: ["${unqiueColumn}"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        ${InfluxService.fillUniqueColumn(unqiueColumn)}`;
        }

        const res = queryApi.collectRows(fluxQuery);
        return res;
    }

    static fillUniqueColumn(columnName) {
        return `|> filter(fn: (r) => exists r.${columnName})
                |> unique(column: "${columnName}" )`;
    }
    dropService(bucket: string, org: string = this.org, businessID: string, serviceId: string) {
        const deleteClient = new DeleteAPI(this.dbclient);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        InfluxService.logger.warn('Deleting Service from DB', { businessID, serviceId, org, bucket });
        const response = deleteClient.postDelete({
            bucket,
            org,
            body: {
                start: startDate.toISOString(),
                stop: endDate.toISOString(),
                predicate: `_measurement="${ServiceEntity._measurement}" AND businessID="${businessID}" AND serviceId="${serviceId}"`,
            },
        });
        return response;
    }
    dropMeasurementsBetweenDateRanges(
        bucket: string,
        org: string = this.org,
        { startTime, endTime, infrastructureType, businessID }
    ) {
        // Warning this method deletes all measurements for all services between the date range specified.
        const deleteClient = new DeleteAPI(this.dbclient);
        const startDate = new Date(startTime);
        const endDate = new Date(endTime);
        InfluxService.logger.warn('Deleting Measurements from DB', {
            businessID,
            org,
            bucket,
            startTime,
            endTime,
            infrastructureType,
        });
        const response = deleteClient.postDelete({
            bucket,
            org,
            body: {
                start: startDate.toISOString(),
                stop: endDate.toISOString(),
                predicate: `_measurement="${MeasurementEntity._measurement}" AND businessID="${businessID}"  AND _field="${infrastructureType}"`,
            },
        });
        return response;
    }
    getMeasurementsBetweenDateRange({ startTime, endTime, infrastructureType, businessID }) {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const fluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${MeasurementEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => r["_field"] == "${infrastructureType}")`;
        InfluxService.logger.debug(fluxQuery);
        const res = queryApi.collectRows(fluxQuery);
        return res;
    }
    getUsageForKubernetesPods = async ({ startTime, endTime, businessID, filters = [] }): Promise<Array<any>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        let fluxQuery;
        if (filters?.length) {
            fluxQuery = `labeldata = from(bucket: "${process.env.STAGE}-usage-data")
            |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
            |> filter(fn: (r) => r["businessID"] == "${businessID}")
            |> filter(fn: (r) => exists r.pod)
            |> filter(fn: (r)=> r["__name__"] == "kube_pod_labels")
            ${InfluxService.metadataFilterBuilder(filters)}
            |> group(columns: ["pod"], mode:"by")
            |> unique(column:"__name__")
            |> yield(name: "labeldata")
            |> keep(columns: ["pod"])
    
    
            usagedata = from(bucket: "${process.env.STAGE}-usage-data")
            |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
            |> filter(fn: (r) => r["businessID"] == "${businessID}")
            |> filter(fn: (r)=> r["__name__"] != "kube_pod_labels")
            |> filter(fn: (r) => exists r.pod)
            |> sort(columns: ["_time"], desc: true)
            |> group(columns: ["pod"], mode:"by")
            |> unique(column:"__name__")
    
            JoinedPods = join(
                tables: {labels:labeldata, usage:usagedata},
                on: ["pod"],
            )
            |> yield( name: "podUsage")

            startMetricTime = from(bucket: "${process.env.STAGE}-usage-data")
            |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
            |> filter(fn: (r) => r["businessID"] == "${businessID}")
            |> filter(fn: (r) => exists r.pod)
            |> sort(columns: ["_time"], desc: false)
            |> group(columns: ["pod"], mode:"by")
            |> first()
            
            endMetricTime = from(bucket: "${process.env.STAGE}-usage-data")
            |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
            |> filter(fn: (r) => r["businessID"] == "${businessID}")
            |> filter(fn: (r) => exists r.pod)
            |> sort(columns: ["_time"], desc: false)
            |> group(columns: ["pod"], mode:"by")
            |> last()
            |> keep(columns: ["_time", "pod"])
    
            JoinedMetricPods = join(
                tables: {endMetricTime:endMetricTime, startMetricTime:startMetricTime},
                on: ["pod"],
            )
            join(
                tables: {labelsAndMetrics:JoinedPods, metricStartAndEndTime:JoinedMetricPods},
                on: ["pod"],
            )
            |> keep(columns: ["_time_endMetricTime", "_time_startMetricTime", "pod"])
            |> unique(column:"pod")
            `;
        } else {
            fluxQuery = ` 
        podData = from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.pod)
        |> sort(columns: ["_time"], desc: true)
        |> group(columns: ["pod"], mode:"by")
        |> unique(column:"__name__")
        |> yield( name: "podUsage")

        startMetricTime = from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.pod)
        |> group(columns: ["pod"], mode:"by")
        |> sort(columns: ["_time"], desc: false)
        |> first()
        
        endMetricTime = from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.pod)
        |> group(columns: ["pod"], mode:"by")
        |> sort(columns: ["_time"], desc: false)
        |> last()
        |> keep(columns: ["_time", "pod"])

        JoinedMetricPods = join(
            tables: {endMetricTime:endMetricTime, startMetricTime:startMetricTime},
            on: ["pod"],
        )

        join(
            tables: {labelsAndMetrics:podData, metricStartAndEndTime:JoinedMetricPods},
            on: ["pod"],
        )
        |> keep(columns: ["_time_endMetricTime", "_time_startMetricTime", "pod"])
        |> unique(column:"pod")
        `;
        }
        InfluxService.logger.debug(fluxQuery);
        const res = queryApi.collectRows(fluxQuery);
        return res;
    };

    getAllStartStopTimesForPodsInBusiness = async ({ businessID, startTime, endTime }): Promise<Array<any>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        // I couldn't figure out how to join node and Pod data in Influx, so it needs to be taken care of outside of Influx
        // Additionally, I was too frustrated to figure out how to rewrite the query to not need the first node lookup so I kept it, thats why there is a nodeData2.
        // If you want to fix this please go ahead.
        const fluxQuery = `
        import "join"
        
        

        firstTime = from(bucket: "${process.env.STAGE}-usage-data")
                |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
                |> filter(fn: (r) => r["businessID"] == "${businessID}")
                |> filter(fn: (r) => r["_measurement"] == "meteringco_kube_pod_container_status_running")
                |> filter(fn: (r) => exists r.pod)
                |> keep(columns:["_measurement", "_field", "_start", "_stop", "_time", "_value", "pod", "uid"])
                |> group(columns: ["pod"], mode:"by")
                |> first()
        lastTime = from(bucket: "${process.env.STAGE}-usage-data")
                |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
                |> filter(fn: (r) => r["businessID"] == "${businessID}")
                |> filter(fn: (r) => r["_measurement"] == "meteringco_kube_pod_container_status_running")
                |> filter(fn: (r) => exists r.pod)
                |> keep(columns:["_measurement", "_field", "_start", "_stop", "_time", "_value", "pod", "uid"])
                |> group(columns: ["pod"], mode:"by")
                |> last() 
        
                firstAndLast = union(tables: [firstTime, lastTime])
                |> group(columns: ["pod"], mode:"by")            
                     
                nodeData = from(bucket: "${process.env.STAGE}-usage-data")
                |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
                |> filter(fn: (r) => r["businessID"] == "${businessID}")
                |> filter(fn: (r) => exists r.pod)
                |> filter(fn: (r) => exists r.node)
                |> group(columns: ["pod"], mode:"by")
                |> unique(column: "pod")
                |> keep(columns: ["node", "pod"])
                |> group(columns: ["pod"], mode:"by")
        
                startStopDeleteodeInfo = join.tables(
                    method: "left",
                    left: firstAndLast, 
                    right:   nodeData,
                    on: (l, r) => l.pod == r.pod,
                    as: (l, r) => ({ l with node: r.node}), 	
                )
                |> group(columns: ["pod"], mode:"by")
                
                
                
                podLabels = from(bucket: "${process.env.STAGE}-usage-data")
                |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
                |> filter(fn: (r) => r["businessID"] == "${businessID}")
                    |> filter(fn: (r) => r["_measurement"] == "meteringco_kube_pod_labels")
                    |> filter(fn: (r) => exists r.label_meteringco_service_id or exists r.label_meteringco_application_id)
                    |> filter(fn: (r) => exists r.pod)
                    |> group(columns: ["pod"], mode:"by")
                    |> unique(column:"pod")
                  
                    union(tables: [podLabels, startStopDeleteodeInfo])
                    |> group(columns: ["pod"], mode:"by") 
                    |> sort(columns:["_time"], desc: true)
                
        `;
        InfluxService.logger.debug(fluxQuery);
        const res = queryApi.collectRows(fluxQuery);

        return res;
    };
    getAllPodsForBusiness = async ({ startTime, endTime, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const fluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.pod)
        |> keep(columns: ["_time", "pod"])
        |> group(columns: ["pod"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "pod")`;
        const res = queryApi.collectRows(fluxQuery);
        return res;
    };

    getPodsInReadyState = async ({
        startTime,
        endTime,
        businessID,
    }: {
        startTime: Date;
        endTime: Date;
        businessID: string;
    }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const fluxQuery = `import "join"

        ready = from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
                      |> filter(fn: (r) => r["_measurement"] == "meteringco_kube_pod_container_status_running")
                      |> filter(fn: (r) => exists r.pod)
                      |> keep(columns:["_measurement", "_field", "_start", "_stop", "_time", "_value", "pod", "uid"])
                      |> group(columns: ["pod"], mode:"by")
                      |> unique(column: "pod")
                      
                      
                      
                    podLabels = from(bucket: "${process.env.STAGE}-usage-data")
                    |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
                    |> filter(fn: (r) => r["businessID"] == "${businessID}")
                        |> filter(fn: (r) => r["_measurement"] == "meteringco_kube_pod_labels")
                        |> filter(fn: (r) => exists r.label_meteringco_service_id or exists r.label_meteringco_application_id)
                        |> filter(fn: (r) => exists r.pod)
                        |> group(columns: ["pod"], mode:"by")
                        |> unique(column:"pod")
                      
                        union(tables: [podLabels, ready])
                        |> group(columns: ["pod"], mode:"by") 
                        |> sort(columns:["_time"], desc: true)`;

        InfluxService.logger.debug(fluxQuery);
        const res = queryApi.collectRows(fluxQuery);
        return res;
    };

    getLatestPodLabelsByID = async ({ podId, startTime, endTime, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const fluxQuery = `
                    from(bucket: "${process.env.STAGE}-usage-data")
                        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
                        |> filter(fn: (r) => r["businessID"] == "${businessID}")
                        |> filter(fn: (r) => r["_measurement"] == "meteringco_kube_pod_labels")
                        |> filter(fn: (r) => exists r.label_meteringco_service_id or exists r.label_meteringco_application_id)
                        |> filter(fn: (r) => exists r.label_meteringco_dimension_id)
                        |> filter(fn: (r) => exists r.pod)
                        |> filter(fn: (r) => r["pod"] == "${podId}")
                        |> group(columns: ["pod"], mode:"by")
                        |> last()`;
        const res = queryApi.collectRows<LabelPodInfluxRow>(fluxQuery);
        return res;
    };

    getMetricLoadTime = async ({ startTime, endTime, businessID }) => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const fluxQuery = `
        
        startMetricTime = from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.pod)
        |> sort(columns: ["_time"], desc: false)
        |> group(columns: ["pod"], mode:"by")
        |> first()
        
        endMetricTime = from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startTime).toISOString()}, stop:${new Date(endTime).toISOString()})
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => exists r.pod)
        |> sort(columns: ["_time"], desc: false)
        |> group(columns: ["pod"], mode:"by")
        |> last()
        |> keep(columns: ["_time", "pod"])

        join(
            tables: {endMetricTime:endMetricTime, startMetricTime:startMetricTime},
            on: ["pod"],
        )              
        
        `;
        const res = queryApi.collectRows(fluxQuery);
        return res;
    };

    static determineAggregationWindowFunction(aggregationMethod, aggregationInterval, samplingFrequency): string {
        if (aggregationMethod === 'Count') {
            // Need to aggregate twice to remove duplicates in the sample
            return `aggregateWindow(every: ${aggregationInterval}m, fn: count, createEmpty: false) 
                    |> count()`;
        }
        if (aggregationMethod === 'Average') {
            return `aggregateWindow(every: ${aggregationInterval}m, fn: mean, createEmpty: false)`;
        }
    }
    static metadataFilterBuilder(filters: Array<MeteringCoFilters>) {
        return filters.reduce((acc, { key, values }) => {
            values.forEach((value) => {
                acc += `|> filter(fn: (r) => r["${key}"] == "${value}") \n`;
            });

            return acc;
        }, '');
    }

    getSingleDimension = async ({ businessID, dimensionId }: ReadDimensionDto): Promise<Array<any>> => {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${DimensionEntity._measurement}")
        |> filter(fn: (r) => r["dimensionId"] == "${dimensionId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "dimensionId")`;

        const res = queryApi.collectRows(fluxQuery);
        return res;
    };

    getLatestSettings({ businessID }): Promise<Array<any>> {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${SettingsEntity._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_measurement"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> unique(column: "businessID")`;

        const res = queryApi.collectRows<SettingInfluxRow>(fluxQuery);
        return res;
    }

    getInvoicesForCustomer({
        businessID,
        customerId,
        startDate,
        endDate,
        onlyOpenAndPaid,
    }: {
        businessID: string;
        customerId: string;
        startDate?: string;
        endDate?: string;
        onlyOpenAndPaid?: boolean;
    }): Promise<Array<any>> {
        const queryApi = this.dbclient.getQueryApi(this.org);
        let influxStartDate;
        let influxEndDate;
        if (startDate) {
            influxStartDate = new Date(startDate);
        } else {
            influxStartDate = new Date('January 1, 1970 00:00:00');
        }
        if (endDate) {
            influxEndDate = new Date(endDate);
        } else {
            influxEndDate = new Date();
        }
        let fluxQuery;
        if (onlyOpenAndPaid) {
            fluxQuery = `from(bucket: "${process.env.STAGE}-config")
            |> range(start: ${new Date(influxStartDate).toISOString()}, stop:${new Date(influxEndDate).toISOString()})
            |> filter(fn: (r) => r["_measurement"] == "${Invoice._measurement}")
            |> filter(fn: (r) => r["customerId"] == "${customerId}")
            |> filter(fn: (r) => r["businessID"] == "${businessID}")
            |> filter(fn: (r) => r["invoiceStatus"] == "Open" or r["invoiceStatus"] == "Paid")
            |> group(columns: ["_value"], mode:"by")
            |> sort(columns: ["_time"], desc: true)
            |> top(n: 1)`;
        } else {
            fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(influxStartDate).toISOString()}, stop:${new Date(influxEndDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${Invoice._measurement}")
        |> filter(fn: (r) => r["customerId"] == "${customerId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_value"], mode:"by")
        |> sort(columns: ["_time"], desc: true)
        |> top(n: 1)`;
        }

        InfluxService.logger.debug(fluxQuery);
        const res = queryApi.collectRows<InvoiceInfluxRow>(fluxQuery);
        return res;
    }

    getSingleInvoice({ businessID, invoiceId }): Promise<Array<any>> {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const startDate = new Date('January 1, 1970 00:00:00');
        const endDate = new Date();
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${Invoice._measurement}")
        |> filter(fn: (r) => r["invoiceId"] == "${invoiceId}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_value"], mode:"by")
        |> sort(columns: ["_time"], desc: true)`;

        const res = queryApi.collectRows<InvoiceInfluxRow>(fluxQuery);
        return res;
    }

    getAllInvoiceRevenue({ businessID, startDate, endDate }): Promise<Array<any>> {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const fluxQuery = `from(bucket: "${process.env.STAGE}-config")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${Invoice._measurement}")
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["_value"], mode: "by")
        |> sort(columns: ["_time"], desc: true)
        |> top(n: 1)
        |> filter(fn: (r) => r["invoiceStatus"] == "Open" or r["invoiceStatus"] == "Paid")`;

        InfluxService.logger.debug(fluxQuery);
        const res = queryApi.collectRows<InvoiceInfluxRow>(fluxQuery);
        return res;
    }

    aggregateMonthlyComputeCosts({ businessID, startDate, endDate }): Promise<Array<any>> {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const averageEC2CostFluxQuery = `from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${EC2CostEntity._measurement}")
        |> drop(columns:["timeDelta"])
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> group(columns: ["podId", "meteringcoId", "cpu", "ram"], mode:"by")
        |> aggregateWindow(every: 1h, fn: mean)
        |> aggregateWindow(every: 1mo, fn: sum)
        |> group(columns: ["_time"], mode:"by")
        |> sum(column: "_value")`;
        InfluxService.logger.debug(averageEC2CostFluxQuery);

        const res = queryApi.collectRows<MonthlyCostInfluxRow>(averageEC2CostFluxQuery);

        return res;
    }
    aggregateMonthlyComputeCostsByCustomer({
        businessID,
        startDate,
        endDate,
        serviceAndApplicationIds,
    }): Promise<Array<any>> {
        const queryApi = this.dbclient.getQueryApi(this.org);
        const averageEC2CostFluxQuery = `
        arrayValues = [${this.buildArrayValues(serviceAndApplicationIds)}]
        
        from(bucket: "${process.env.STAGE}-usage-data")
        |> range(start: ${new Date(startDate).toISOString()}, stop:${new Date(endDate).toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "${EC2CostEntity._measurement}")
        |> drop(columns:["timeDelta"])
        |> filter(fn: (r) => r["businessID"] == "${businessID}")
        |> filter(fn: (r) => contains(value: r["meteringcoId"], set: arrayValues))
        |> group(columns: ["podId", "meteringcoId", "cpu", "ram"], mode:"by")
        |> aggregateWindow(every: 1h, fn: mean)
        |> aggregateWindow(every: 1mo, fn: sum)
        |> group(columns: ["_time"], mode:"by")
        |> sum(column: "_value")`;
        InfluxService.logger.debug(averageEC2CostFluxQuery);

        const res = queryApi.collectRows<MonthlyCostInfluxRow>(averageEC2CostFluxQuery);

        return res;
    }

    private buildArrayValues(values: Array<any>): string {
        let arrayValues = '';
        values.forEach((value, index) => {
            if (index === 0) {
                arrayValues += `"${value}"`;
            } else {
                arrayValues += `,"${value}"`;
            }
        });
        return arrayValues;
    }
}
