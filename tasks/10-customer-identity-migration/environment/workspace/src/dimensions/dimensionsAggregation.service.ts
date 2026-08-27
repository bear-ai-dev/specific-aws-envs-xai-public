import { forwardRef, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InfluxService } from '../influx/influx.service';
import { aggregationInterval, dataBasedUnits, roundingEnum, timeBasedUnits } from './dto/create-dimension.dto';
import { MeasurementConfigService } from '../measurement-config/measurement-config.service';
import { Process, Processor } from '@nestjs/bull';
import { OfferingService } from '../offering/offering.service';
import { ServicesService } from '../services/services.service';
import flattenDeep from 'lodash.flattendeep';
import { upTimeAggregationEntity } from './entities/uptimeAggregationEntity';
import { DimensionsService } from './dimensions.service';
import { EbsVolumeDataGathererEntity } from '../microservices/ebsVolumeDataGatherer/entities/ebsVolumeDataGatherer.entity';
import { ebsVolumeAggregationEntity } from './entities/ebsVolumeAggregationEntity';
import { EbsSnapshotDataGathererEntity } from '../microservices/ebsSnapshotDataGatherer/entities/ebsSnapshotDataGatherer.entity';
import { ebsSnapshotAggregationEntity } from './entities/ebsSnapshotAggregationEntity';
import { AggregationDto } from './dto/aggregation.dto';
import { Job } from 'bull';
import { SupportedMeasurementFrequencies } from '../scheduler/dto/scheduler.dto';
import { SchedulerEntity } from '../scheduler/entities/scheduler.entity';
import { UsageService } from '../usage/usage.service';
import { AggregatedUsageResponse } from '../services/dto/readService.dto';
import { StandardMeasurementEntity } from '../measurement-config/entities/standardMeasurement.entity';
import { AggregateUsageEntity } from '../usage/entities/usage.entity';
import { MeasurementFormat } from '../measurement-config/entities/measurement.interface';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
const HOUR_TO_MINUTES = 60;

@Processor('scheduler_queue')
export class DimensionAggregationService {
    private static readonly logger = new Logger(DimensionAggregationService.name);
    constructor(
        readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => MeasurementConfigService)) readonly measurementConfigService: MeasurementConfigService,
        @Inject(forwardRef(() => OfferingService)) readonly offeringService: OfferingService,
        @Inject(forwardRef(() => ServicesService)) readonly servicesService: ServicesService,
        @Inject(forwardRef(() => DimensionsService)) readonly dimensionsService: DimensionsService,
        @Inject(forwardRef(() => UsageService)) readonly usageService: UsageService
    ) {}

    @Process({ name: 'podUptime' })
    public async aggregatePodUptime({ data: { scheduleParameters } }: Job<SchedulerEntity>) {
        const { businessID, dimensionId, rate } = scheduleParameters as AggregationDto;
        DimensionAggregationService.logger.log(`Starting aggregation for dimension: ${dimensionId}`);
        const {
            data: [dimension],
        } = await this.dimensionsService.findOne({ dimensionId, businessID });
        const { aggregationInterval: dimensionAggregationInterval } = dimension;

        const { timeSegments } = this.cronRateToHoursElapsed(rate, dimensionAggregationInterval);

        // The below delimiter is because the applicationId is gaurenteed to be unique to only other applicationIds, it could conflict with serviceIds
        const delimeterForApplicationIDServiceIDMap = 'client_applicationId_';
        const serviceAndApplicationIds = await this.getServicesUsingDimension({ dimensionId, businessID });

        // Get their serviceIds/applicationIds
        // Lookup all pods which are using these serviceIds/applicationIds
        // determine for each aggregation interval if there exists a time when the pod was "ready"
        let pods;
        try {
            const podsJoinedByServiceAndApplicationId = await Promise.all(
                timeSegments.map(
                    async ({ startTime, endTime }): Promise<{ startTime: Date; endTime: Date; data: Array<any> }> => {
                        pods = await this.InfluxService.getPodsInReadyState({ startTime, endTime, businessID });
                        const joinedResults = pods.reduce((acc, { table, _value, pod, _measurement, ...rest }) => {
                            // Join pods with their labels, this done outside of influx for now
                            if (!acc[pod]) {
                                acc[pod] = {};
                            }
                            if (_measurement === 'meteringco_kube_pod_labels') {
                                const { label_meteringco_application_id, label_meteringco_service_id } = rest;
                                if (label_meteringco_service_id) {
                                    acc[pod] = { ...acc[pod], serviceId: label_meteringco_service_id };
                                }
                                if (label_meteringco_application_id) {
                                    acc[pod] = {
                                        ...acc[pod],
                                        applicationId: `${delimeterForApplicationIDServiceIDMap}${label_meteringco_application_id}`,
                                    };
                                }
                            }
                            if (_measurement === 'meteringco_kube_pod_container_status_running') {
                                acc[pod] = { ...acc[pod], usage: _value };
                            }
                            return acc;
                        }, {});
                        return { startTime, endTime, data: joinedResults };
                    }
                )
            );

            // Aggregate the results to the service Level
            const uniqueIdsUpTimeHours = podsJoinedByServiceAndApplicationId.reduce(
                (acc, { startTime, endTime, data }): Record<string, any> => {
                    const podsKeys = Object.keys(data);
                    const isoStartTime = startTime.toISOString();
                    const isoEndTime = endTime.toISOString();
                    // Below we map which segments of time are in use by which service/application
                    // Importantly, if there are overlapping segements for pods (IE: Multiple pods per service that are up in the same window)
                    // It doesn't matter since all we need to have is a single "Ready" value to be considered "up"
                    podsKeys.forEach((key) => {
                        const { applicationId, serviceId, usage } = data[key];
                        if (serviceId) {
                            if (acc[serviceId]) {
                                acc[serviceId][`${isoStartTime}##${isoEndTime}`] = usage;
                            } else {
                                acc[serviceId] = {};
                                acc[serviceId][`${isoStartTime}##${isoEndTime}`] = usage;
                            }
                        } else if (applicationId) {
                            if (acc[`${applicationId}`]) {
                                acc[`${applicationId}`][`${isoStartTime}##${isoEndTime}`] = usage;
                            } else {
                                acc[`${applicationId}`] = {};
                                acc[`${applicationId}`][`${isoStartTime}##${isoEndTime}`] = usage;
                            }
                        }
                    });
                    return acc;
                },
                {}
            );
            DimensionAggregationService.logger.log(`uniqueIdsUpTimeHours: ${JSON.stringify(uniqueIdsUpTimeHours)}`);

            const filteredKeys = this.filterPodsByServiceAndApplicationIds({
                delimeterForApplicationIDServiceIDMap,
                servicesAndApplicationsWhichUseCurrentDimension: serviceAndApplicationIds,
                allPodsWhichAreTagged: Object.keys(uniqueIdsUpTimeHours),
            });
            DimensionAggregationService.logger.log(`filteredKeys: ${JSON.stringify(filteredKeys)}`);
            const points = filteredKeys.reduce((acc, item) => {
                const timeRanges = Object.keys(uniqueIdsUpTimeHours[item]);
                // Fill in Zero values for time ranges where there is no data
                const timeRangesWithZeroValues = timeSegments.map(({ startTime, endTime }) => {
                    const isoStartTime = startTime.toISOString();
                    const isoEndTime = endTime.toISOString();
                    const timeRange = `${isoStartTime}##${isoEndTime}`;
                    if (!timeRanges.includes(timeRange)) {
                        return { timeRange, value: 0 };
                    }
                    return { timeRange, value: uniqueIdsUpTimeHours[item][timeRange] };
                });
                // Convert to entity and then to Points in Influx
                const pointsArray = timeRangesWithZeroValues.map(({ timeRange: element, value }) => {
                    const [startTime, endTime] = element.split('##');
                    const idIsApplicationId = item.includes(delimeterForApplicationIDServiceIDMap);

                    const entity = new upTimeAggregationEntity({
                        startTime,
                        endTime,
                        upTime: value * HOUR_TO_MINUTES,
                        dimensionId,
                        businessID,
                        applicationId: idIsApplicationId
                            ? item.replace(delimeterForApplicationIDServiceIDMap, '')
                            : undefined,
                        serviceId: idIsApplicationId
                            ? serviceAndApplicationIds.find(
                                  ({ applicationId }) =>
                                      item === `${delimeterForApplicationIDServiceIDMap}${applicationId}`
                              )?.serviceId
                            : item,
                        units:
                            dimensionAggregationInterval === aggregationInterval.hour ? timeBasedUnits.hour : undefined,
                    });
                    const point = upTimeAggregationEntity.transformer(entity, this.InfluxService);
                    return point;
                });

                acc.push(pointsArray);
                return acc;
            }, []);
            DimensionAggregationService.logger.log(`points: ${JSON.stringify(points)}`);
            const flattenedPoints = flattenDeep(points);
            await this.InfluxService.loadPoints(`${process.env.STAGE}-aggregate-usage`, 'meteringco', flattenedPoints);
            DimensionAggregationService.logger.log(`Committed to Influx`);
        } catch (error) {
            DimensionAggregationService.logger.error(error);
            throw error;
        }
    }

    @Process({ name: 'ebsVolume' })
    public async aggregateEBSVolumeUsage({ data: { scheduleParameters } }: Job<SchedulerEntity>) {
        const { businessID, dimensionId, rate } = scheduleParameters as AggregationDto;
        DimensionAggregationService.logger.log(`Starting EBS volume aggregation for dimension: ${dimensionId}`);
        const {
            data: [dimension],
        } = await this.dimensionsService.findOne({ dimensionId, businessID });
        const { aggregationInterval: dimensionAggregationInterval } = dimension;
        const servicesAndApplicationIds = await this.getServicesUsingDimension({ dimensionId, businessID });
        // Get rate to timeRange
        const { timeSegments } = this.cronRateToHoursElapsed(rate, dimensionAggregationInterval);
        // Get all volumes tagged with a serviceId or applicationId
        const pointsToCommit = flattenDeep(
            timeSegments.map(async ({ startTime, endTime }) => {
                const ebsVolumesDbModel = await this.InfluxService.getMeteringCoTaggedMaxEbsVolumeMeasurementInTimeRange({
                    startTime,
                    endTime,
                    businessID,
                });
                const ebsVolumeEntities = ebsVolumesDbModel.map((dbModel) =>
                    EbsVolumeDataGathererEntity.dbModelToEntity(dbModel)
                );

                // Filter by volumes tagged with the appropriate service/applicationId (The ones associated with the dimension)
                const filteredEBSVolumes = this.filterEBSByServiceAndApplicationIds(
                    ebsVolumeEntities,
                    servicesAndApplicationIds
                );

                // Create the entity and then the point
                const points = (filteredEBSVolumes as EbsVolumeDataGathererEntity[]).map(
                    (ebsVolume: EbsVolumeDataGathererEntity) => {
                        const entity = new ebsVolumeAggregationEntity({
                            startTime: startTime.toISOString(),
                            endTime: endTime.toISOString(),
                            volumeID: ebsVolume.volumeID,
                            size: this.roundValueBasedOnRoundingType({
                                value: ebsVolume.size,
                                rounding: dimension.rounding,
                            }),
                            dimensionId,
                            businessID,
                            applicationId: ebsVolume.tags.find(({ Key }) => Key === 'tag_meteringcoApplicationId')?.Value,
                            serviceId: ebsVolume.tags.find(({ Key }) => Key === 'tag_meteringcoServiceId')?.Value,
                            units: dataBasedUnits.gigabyte,
                        });
                        return ebsVolumeAggregationEntity.transformer(entity, this.InfluxService);
                    }
                );
                return points;
            })
        );
        await this.InfluxService.loadPoints(`${process.env.STAGE}-aggregate-usage`, 'meteringco', pointsToCommit);
        DimensionAggregationService.logger.log(`Starting Finished Aggregating for EBS Volume dimension`);
    }

    @Process({ name: 'ebsSnapshot' })
    public async aggregateEBSSnapshotUsage({ data: { scheduleParameters } }: Job<SchedulerEntity>) {
        const { businessID, dimensionId, rate } = scheduleParameters as AggregationDto;
        DimensionAggregationService.logger.log(`Starting EBS Snapshot aggregation for dimension: ${dimensionId}`);
        const {
            data: [dimension],
        } = await this.dimensionsService.findOne({ dimensionId, businessID });
        const { aggregationInterval: dimensionAggregationInterval } = dimension;
        const servicesAndApplicationIds = await this.getServicesUsingDimension({ dimensionId, businessID });
        // Get rate to timeRange
        const { timeSegments } = this.cronRateToHoursElapsed(rate, dimensionAggregationInterval);
        // Get all volumes tagged with a serviceId or applicationId
        const pointsToCommit = flattenDeep(
            timeSegments.map(async ({ startTime, endTime }) => {
                const ebsVolumesDbModel = await this.InfluxService.getMeteringCoTaggedMaxEbsSnapshotMeasurementInTimeRange({
                    startTime,
                    endTime,
                    businessID,
                });
                const ebsSnapshotentities = ebsVolumesDbModel.map((dbModel) =>
                    EbsSnapshotDataGathererEntity.dbModelToEntity(dbModel)
                );

                // Filter by snapshots tagged with the appropriate service/applicationId (The ones associated with the dimension)

                const filteredEBSSnapshots = this.filterEBSByServiceAndApplicationIds(
                    ebsSnapshotentities,
                    servicesAndApplicationIds
                );

                // Create the entity and then the point
                const points = (filteredEBSSnapshots as EbsSnapshotDataGathererEntity[]).map(
                    (ebsSnapshot: EbsSnapshotDataGathererEntity) => {
                        const entity = new ebsSnapshotAggregationEntity({
                            startTime: startTime.toISOString(),
                            endTime: endTime.toISOString(),
                            snapshotId: ebsSnapshot.snapshotId,
                            size: this.roundValueBasedOnRoundingType({
                                value: ebsSnapshot.size,
                                rounding: dimension.rounding,
                            }),
                            dimensionId,
                            businessID,
                            applicationId: ebsSnapshot.tags.find(({ Key }) => Key === 'tag_meteringcoApplicationId')?.Value,
                            serviceId: ebsSnapshot.tags.find(({ Key }) => Key === 'tag_meteringcoServiceId')?.Value,
                            units: dataBasedUnits.gigabyte,
                        });
                        return ebsSnapshotAggregationEntity.transformer(entity, this.InfluxService);
                    }
                );
                return points;
            })
        );
        await this.InfluxService.loadPoints(`${process.env.STAGE}-aggregate-usage`, 'meteringco', pointsToCommit);
    }

    @Process({ name: 'aggregation' })
    public async aggregateUsage({ data: { scheduleParameters } }: Job<SchedulerEntity>) {
        // Get the dimension
        const { businessID, dimensionId, rate } = scheduleParameters as AggregationDto;
        DimensionAggregationService.logger.log(`Starting aggregation for dimension: ${dimensionId}`);
        // Find services by dimensionId
        const servicesAndApplicationIds = await this.getServicesUsingDimension({ dimensionId, businessID });
        // Get rate to timeRange
        const {
            data: [dimension],
        } = await this.dimensionsService.findOne({ dimensionId, businessID });
        const { aggregationInterval: dimensionAggregationInterval } = dimension;
        const { timeSegments } = this.cronRateToHoursElapsed(rate, dimensionAggregationInterval);
        const start = timeSegments[0]?.startTime;
        const end = timeSegments[timeSegments.length - 1]?.endTime;
        await Promise.all(
            servicesAndApplicationIds.map(async ({ serviceId, applicationId }) => {
                const aggregateUsageData = (await this.usageService.findUsageForService(
                    { serviceId, businessID },
                    { startTime: start.toISOString(), endTime: end.toISOString() }
                )) as AggregatedUsageResponse[];
                const points = await Promise.all(
                    aggregateUsageData
                        .find(({ dimensionId: usageDimensionId }) => usageDimensionId === dimensionId)
                        ?.usage.map(async (usage) => {
                            const { value, startTime } = usage;
                            const entity = new StandardMeasurementEntity({
                                _measurement: AggregateUsageEntity._measurement,
                                dimensionId,
                                businessID,
                                serviceId,
                                applicationId,
                                timeStamp: startTime,
                                recordValue: parseFloat(value),
                                metadata: {},
                            });
                            const point = MeasurementFormat.getPointForm(entity, this.InfluxService);
                            return point;
                        })
                );
                if (points) {
                    try {
                        await this.InfluxService.loadPoints(`${process.env.STAGE}-aggregate-usage`, 'meteringco', points);
                    } catch (e) {
                        AuditService.publishEvent({
                            topic: AuditScope.ERROR,
                            message: `Error loading points for service: ${serviceId}`,
                            data: [{ error: e, points }],
                        });
                    }
                } else {
                    DimensionAggregationService.logger.log(`No usage found for service: ${serviceId}`);
                }
            })
        );
    }
    private filterEBSByServiceAndApplicationIds(
        ebsVolumes: EbsVolumeDataGathererEntity[] | EbsSnapshotDataGathererEntity[],
        validServiceAndApplicationIds: Array<{ serviceId: string; applicationId: string }>
    ): EbsVolumeDataGathererEntity[] | EbsSnapshotDataGathererEntity[] {
        // Hack: https://stackoverflow.com/questions/58772314/typescript-array-prototype-map-has-error-expression-is-not-callable-when-th
        // Should be updated when https://github.com/microsoft/TypeScript/issues/44373 gets merged
        return (ebsVolumes as any[]).filter((ebsVolume) => {
            const { tags } = ebsVolume;
            return tags.find(({ Key, Value }) => {
                if (Key === 'tag_meteringcoServiceId' || Key === 'tag_meteringcoApplicationId') {
                    return validServiceAndApplicationIds.some(
                        ({ serviceId, applicationId }) => Value === serviceId || Value === applicationId
                    );
                }
            });
        });
        // Given a list of ebsVolumes, filter out the ones which do not contain a serviceId or applicationId TAG within the validServiceAndApplicationIds Array
    }
    private roundValueBasedOnRoundingType({ rounding, value }: { rounding: roundingEnum; value: number }): number {
        if (rounding === 'floor') {
            return Math.floor(value);
        }
        if (rounding === 'ceiling') {
            return Math.ceil(value);
        }
        throw new InternalServerErrorException(`Rounding type: ${rounding} is not supported`);
    }
    private async getServicesUsingDimension({
        dimensionId,
        businessID,
    }): Promise<{ serviceId: string; applicationId: string }[]> {
        // Find all offerings which are using this dimension
        const { data: offeringIds } = await this.offeringService.findOfferingIdsByDimensionId({
            dimensionId,
            businessID,
        });

        // Get their offeringIds
        // Lookup all services which are using these offeringIds

        const serviceAndApplicationIds = flattenDeep(
            await Promise.all(
                offeringIds.map(async (offeringId) => {
                    const { data } = await this.servicesService.findAllServicesWithofferingId({
                        offeringId,
                        businessID,
                    });
                    return data.map(({ serviceId, applicationId }) => ({ serviceId, applicationId }));
                })
            )
        );
        return serviceAndApplicationIds;
    }
    private filterPodsByServiceAndApplicationIds({
        servicesAndApplicationsWhichUseCurrentDimension,
        allPodsWhichAreTagged,
        delimeterForApplicationIDServiceIDMap,
    }: {
        servicesAndApplicationsWhichUseCurrentDimension: Array<{ serviceId: string; applicationId: string }>;
        allPodsWhichAreTagged: Array<string>;
        delimeterForApplicationIDServiceIDMap?: string;
    }): Array<any> {
        return allPodsWhichAreTagged.filter((key) => {
            return servicesAndApplicationsWhichUseCurrentDimension.find(({ serviceId, applicationId }) => {
                if (key === serviceId) {
                    return true;
                }
                if (key === `${delimeterForApplicationIDServiceIDMap}${applicationId}`) {
                    return true;
                }
                return false;
            });
        });
    }
    /***
     * The cronRate to Hours Elapsed function converts a cron rate to the number of hours elapsed between each execution.
     * It additionally splits the time into segments of the number of hours elapsed.
     * So for example if the cron rate is every 24 hours and the time delta is 1 hour, then the timeSegments array length will be 24.
     * With a startime at midnight and an end time at 1am for the  0th index, and a start time at 1am and an end time at 2am for the 1st index. etc...
     *
     * @param rate - String in Hours, @example: "1"
     * @param dimensionAggregationInterval - The time delta for the aggregation
     * @private
     */
    private cronRateToHoursElapsed(
        rate: SupportedMeasurementFrequencies,
        dimensionAggregationInterval: aggregationInterval
    ): { timeDelta: string; timeSegments: Array<{ startTime: Date; endTime: Date }> } {
        if (
            rate === SupportedMeasurementFrequencies.daily &&
            dimensionAggregationInterval === aggregationInterval.hour
        ) {
            const hoursElapsed = 24;
            const timeSegments = [];
            for (let i = 0; i < hoursElapsed; i++) {
                // Without Moment

                const startTime = new Date(new Date().setUTCHours(i, 0, 0, 0));
                const endTime = new Date(new Date().setUTCHours(i + 1, 0, 0, 0));

                timeSegments.push({ startTime, endTime });
            }
            return { timeDelta: aggregationInterval.hour, timeSegments };
        } else {
            throw new InternalServerErrorException(
                'Failed to convert cron rate to hours elapsed, only 24 hours supported with a aggregationInterval of "hour"'
            );
        }
    }
}
