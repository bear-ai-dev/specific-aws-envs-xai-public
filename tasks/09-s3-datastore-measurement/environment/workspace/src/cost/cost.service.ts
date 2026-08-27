import {
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InfluxService } from '../influx/influx.service';
import { EbsVolumeDataGathererEntity } from '../microservices/ebsVolumeDataGatherer/entities/ebsVolumeDataGatherer.entity';
import { ServicesService } from '../services/services.service';

import {
    CalculatedEbsCostEntity,
    EBSCostEntity,
    IOPSUnitCostRanges,
    StorageUnitCostRanges,
    ThroughPutUnitCostRanges,
} from './entities/ebsCost.entity';

import { awsPriceLookup } from '../utils/aws/awsPricing';
import { getAllRegions } from '../utils/aws/awsEc2';
import { FindCostResponse, supportedEBSTypes, authorizedCostBusinesses } from './dto/cost.dto';
import { InstanceUptimeEntity } from '../microservices/instanceUpTime/entities/instanceUptime.entity';
import { ReservedInstanceEntity } from '../microservices/reservedInstanceHistory/entities/reservedInstances.entity';
import { EC2CostEntity, OnDemandInstanceEntity } from './entities/ec2Cost.entity';
import flattenDeep from 'lodash.flattendeep';
import { joinedResults } from '../influx/utils/joinPodData';

const EVERY_15TH_MINUTE_OF_EVERY_HOUR = '*/15 */1 * * *';
const ONE_HOUR_IN_SECONDS = 3600;
const MS_TO_SECONDS_CONVERSION = 1000;

@Injectable()
export class CostService {
    private static readonly logger = new Logger(CostService.name);
    constructor(
        readonly InfluxService: InfluxService,
        @Inject(forwardRef(() => ServicesService)) readonly servicesService: ServicesService
    ) {}
    private TIME_DELTA_ONE_HOUR = 1;
    @Cron(CronExpression.EVERY_HOUR)
    async getAndCommitEBSCost() {
        CostService.logger.debug(`Starting cost lookup`);
        const businessIdSeries = await this.InfluxService.readAllBusinesses();

        const filteredBusinesses = businessIdSeries.filter(({ businessID }) =>
            Object.values(authorizedCostBusinesses).includes(authorizedCostBusinesses[businessID])
        );
        const allRegions = await getAllRegions();
        CostService.logger.debug(`Regions: ${allRegions}`);
        const costLookup = allRegions.reduce((acc, curr) => {
            acc[curr] = {};
            return acc;
        }, {});
        const ebsVolumeTypes = Object.keys(supportedEBSTypes);
        await Promise.all(
            ebsVolumeTypes.map(async (volType) => {
                for (const region in allRegions) {
                    const currentRegion = allRegions[region];
                    CostService.logger.debug(
                        `Looking for volume cost in this region: ${currentRegion} with this volume type: ${volType}`
                    );

                    const priceList = await CostService.ebsVolumeCost({
                        volumeType: volType,
                        region: currentRegion,
                    });
                    // sleep
                    await new Promise((resolve) => setTimeout(resolve, 1200));

                    costLookup[currentRegion][volType] = priceList;
                }
            })
        );
        await Promise.all(
            filteredBusinesses.map(async ({ businessID }) => {
                try {
                    CostService.logger.debug(`Starting request for business: ${businessID}`);
                    const { data: serviceData } = await this.servicesService.findAllServiceAndApplicationIds({
                        businessID,
                    });
                    await Promise.all(
                        serviceData.map(async ({ serviceId, applicationId }) => {
                            const dbModels = await this.InfluxService.readAllEBSVolumesForAService({
                                serviceId,
                                businessID,
                                applicationId,
                            });
                            const entities = dbModels.map((dbModel) =>
                                EbsVolumeDataGathererEntity.dbModelToEntity(dbModel)
                            );
                            CostService.logger.debug(`Found Entities Length: ${entities.length}`);
                            const costDocuments = await Promise.all(
                                entities.map(async (entity) => {
                                    const {
                                        region,
                                        availabilityZone,
                                        volumeType,
                                        volumeID,
                                        size,
                                        tags,
                                        throughput,
                                        iops,
                                        state,
                                    } = entity;
                                    CostService.logger.debug(`Looking cost up for region ${region}`);

                                    const priceDocuments = costLookup[region][volumeType];
                                    const costDocs = EBSCostEntity.convertAWSPriceListToUnitCostClasses(priceDocuments);
                                    CostService.logger.debug(`Found Cost Docs costDocs: ${costDocs.length}`);
                                    const inputForEBSCostEntity = costDocs.reduce(
                                        (acc, element) => {
                                            if (element instanceof StorageUnitCostRanges) {
                                                const { cost } = element;
                                                acc['storageUnitCost'] = cost;
                                                return acc;
                                            }
                                            if (element instanceof ThroughPutUnitCostRanges) {
                                                const { cost } = element;
                                                acc['throughputUnitCost'] = cost;
                                                return acc;
                                            }
                                            if (element instanceof IOPSUnitCostRanges) {
                                                acc['iopsUnitCosts'].push(element);
                                                acc['freeIops'] = element['freeIopsAmount'];
                                                return acc;
                                            }
                                            throw new InternalServerErrorException(
                                                `Invalid element for EBS Cost Entity construction ${element}`
                                            );
                                        },
                                        {
                                            businessID,
                                            timeDelta: this.TIME_DELTA_ONE_HOUR,
                                            volumeID,
                                            size,
                                            tags,
                                            throughput,
                                            availabilityZone,
                                            region,
                                            iops,
                                            iopsUnitCosts: [],
                                            state,
                                            freeIops: 0,
                                            volumeType,
                                            serviceId,
                                        }
                                    );
                                    return new EBSCostEntity(inputForEBSCostEntity);
                                })
                            );
                            CostService.logger.debug(`Found Inputs for Influx Cost Documents: ${costDocuments.length}`);
                            const points = costDocuments.map((costDocument) => {
                                const calculatedCostDocument = EBSCostEntity.calculateCost(costDocument);
                                return CalculatedEbsCostEntity.transformer(calculatedCostDocument, this.InfluxService);
                            });
                            const { loadPoints } = this.InfluxService;
                            CostService.logger.debug(`Loading Points ${points.length}`);
                            const res = await loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, points);
                            return res;
                        })
                    );
                } catch (error) {
                    if (error.status === 404) {
                        CostService.logger.error(`No Services found for business ${businessID}`);
                    } else {
                        throw error;
                    }
                }
            })
        );
    }

    private static async ebsVolumeCost({ volumeType, region }): Promise<Array<Record<any, any>>> {
        const priceList = await awsPriceLookup(
            [
                {
                    Type: 'TERM_MATCH',
                    Field: 'ServiceCode',
                    Value: 'AmazonEC2',
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'regionCode',
                    Value: region,
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'volumeAPIName',
                    Value: volumeType,
                },
            ],
            'AmazonEC2'
        );

        return priceList.map((price) => (price instanceof String ? price.toJSON() : JSON.parse(price)));
    }
    public static calculatePastHourUptimeOfPods = (startStopDeleteTimesForPods = []) => {
        let previousTableValueCounter = -1;
        // Given a grouped by pod/meteringcoId and sorted table by time, we can calculate the uptime of a pod
        const groupedPods = startStopDeleteTimesForPods.reduce(
            (acc, { table, node, _time, pod: PodID, serviceId, applicationId }, currentIndex, arr) => {
                // If the acc doesn't have the pod / meteringcoId combination add it to the acc
                const combinedID = serviceId ? `${PodID}##${serviceId}` : `${PodID}##${applicationId}`;
                if (!acc[`${combinedID}`]) {
                    acc[`${combinedID}`] = {
                        timeDelta: 0,
                        node,
                    };
                }
                if (previousTableValueCounter < table) {
                    const startTime = new Date(_time).getTime() / MS_TO_SECONDS_CONVERSION;
                    const endTime = new Date(arr[currentIndex + 1]?._time).getTime() / MS_TO_SECONDS_CONVERSION;
                    acc[`${combinedID}`].timeDelta = (startTime - endTime) / ONE_HOUR_IN_SECONDS;
                }

                previousTableValueCounter = table;
                return acc;
            },
            {}
        );
        return groupedPods;
    };
    private static async ec2InstanceCost({ instanceType, region }): Promise<Array<Record<any, any>>> {
        CostService.logger.debug(`Looking up EC2 Instance Cost for ${instanceType} in ${region}`);
        const priceList = await awsPriceLookup(
            [
                {
                    Type: 'TERM_MATCH',
                    Field: 'ServiceCode',
                    Value: 'AmazonEC2',
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'regionCode',
                    Value: region,
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'instanceType',
                    Value: instanceType,
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'marketoption',
                    Value: 'OnDemand',
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'operatingSystem',
                    Value: 'Linux',
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'tenancy',
                    Value: 'Shared',
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'preInstalledSw',
                    Value: 'NA',
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'licenseModel',
                    Value: 'No License required',
                },
                {
                    Type: 'TERM_MATCH',
                    Field: 'capacitystatus',
                    Value: 'Used',
                },
            ],

            'AmazonEC2'
        );
        return priceList.map((price) => (price instanceof String ? price.toJSON() : JSON.parse(price)));
    }

    private static deduplicatePodsPerNode(arrayOfPodTimeDeltasAndNodeIds): Array<any> {
        // sort the array by timeDeltas
        // reduce on the array
        // if the node doesn't exist in the seen nodes cache, push to accum
        // otherwise skip

        const sortedArray = arrayOfPodTimeDeltasAndNodeIds.sort((a, b) => a.timeDelta - b.timeDelta);
        const seenNodes = {};
        const deduplicatedArray = sortedArray.reduce((acc, { node, timeDelta, ...rest }) => {
            if (!seenNodes[node]) {
                seenNodes[node] = true;
                acc.push({ node, timeDelta, ...rest });
            }
            return acc;
        }, []);
        return deduplicatedArray;
    }

    @Cron(CronExpression.EVERY_HOUR)
    async getAndCommitPODCost() {
        const now = new Date();
        const nowUnixSeconds = now.getTime();
        const oneHourAgoDate = new Date(now.getTime() - ONE_HOUR_IN_SECONDS);
        const oneHourAgoUnixSeconds = oneHourAgoDate.getTime();
        const businessIdSeries = await this.InfluxService.readAllBusinesses();
        // Get all actively running pods
        // Find their node name type by node
        const filteredBusinesses = businessIdSeries.filter(({ businessID }) =>
            Object.values(authorizedCostBusinesses).includes(authorizedCostBusinesses[businessID])
        );
        filteredBusinesses.map(async ({ businessID }) => {
            try {
                const startTime = new Date(now.getTime() - ONE_HOUR_IN_SECONDS * 1000);
                const endTime = now.getTime();

                const startStopDeleteTimesForPods = await this.InfluxService.getAllStartStopTimesForPodsInBusiness({
                    businessID,
                    startTime,
                    endTime,
                });
                const joinedPods = joinedResults(startStopDeleteTimesForPods);
                const arrayOfPods = Object.keys(joinedPods).map((pod) => ({ ...joinedPods[pod], pod }));
                const groupedPods = CostService.calculatePastHourUptimeOfPods(arrayOfPods);
                CostService.logger.debug(`runningPods Response Length: ${JSON.stringify(groupedPods)}`);
                CostService.logger.debug(`runningPods Response Length: ${Object.keys(groupedPods).length}`);
                // Get running instances filter by node name from running pods
                const runningInstancesKeys = Object.keys(groupedPods);
                const unfilteredInstances = await Promise.all(
                    runningInstancesKeys.map(async (groupedPodAndMeteringCoId) => {
                        const { node } = groupedPods[groupedPodAndMeteringCoId];
                        CostService.logger.debug(`groupedPodAndMeteringCoId: Node :::: ${groupedPodAndMeteringCoId}: ${node}`);
                        if (!node) {
                            CostService.logger.warn('No node found for pod: ', groupedPodAndMeteringCoId);
                            return;
                        }
                        const dbModels = await this.InfluxService.getEC2InstanceData({
                            businessID,
                            privateDNS: node,
                        });
                        const [podId, meteringcoId] = groupedPodAndMeteringCoId.split('##');
                        return dbModels.map((dbModel) => ({
                            ...InstanceUptimeEntity.dbModelToEntity(dbModel),
                            ...groupedPods[groupedPodAndMeteringCoId],
                            meteringcoId,
                            podId,
                        }));
                    })
                );
                const runningInstances = flattenDeep(unfilteredInstances.filter((instance) => instance));

                const deduplicated = CostService.deduplicatePodsPerNode(runningInstances);

                CostService.logger.debug(
                    `Running Instances Length: ${deduplicated.length}`,
                    JSON.stringify(deduplicated)
                );
                // Get reserved instances count
                const reservedInstanceDbModelList = await this.InfluxService.getReservedInstances({ businessID });
                CostService.logger.debug(`reservedInstanceDbModelList Length: ${reservedInstanceDbModelList.length}`);
                const reservedInstanceEntities = reservedInstanceDbModelList.map((dbModel) =>
                    ReservedInstanceEntity.dbModelToEntity(dbModel)
                );
                const copyOfReservedInstanceEntities = JSON.parse(JSON.stringify(reservedInstanceEntities));
                // Combine the reservedInstance list with the running instances list, tag the running instances with the reserved instance
                const combinedInstances = deduplicated.map((runningInstance) => {
                    const reservedInstanceIndex = copyOfReservedInstanceEntities.findIndex(
                        (reservedInstance) => reservedInstance.instanceType === runningInstance.instanceType
                    );
                    let reservedInstance = false;
                    if (reservedInstanceIndex !== -1) {
                        reservedInstance = copyOfReservedInstanceEntities.splice(reservedInstanceIndex, 1);
                    }
                    return {
                        ...runningInstance,
                        isReserved: reservedInstance ? true : false,
                        ...(reservedInstance && { reservedInstance }),
                    };
                });
                CostService.logger.debug(`combinedInstances Instances Length: ${combinedInstances.length}`);
                // create a Set of instance types and regions, and operating system and type (On demand or reserved)
                const instanceTypeSet = new Set();
                combinedInstances.forEach(({ instanceType, region }) => {
                    if (instanceType && region) {
                        instanceTypeSet.add(`${instanceType}##${region}`);
                    } else {
                        CostService.logger.warn(
                            `Instance Type or Region not found for instance: ${instanceType} :: ${region}`
                        );
                    }
                });
                const priceLists = [];

                // for each element in the set
                // get the price list
                instanceTypeSet.forEach((val) => {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    //@ts-ignore
                    const [instanceType, region] = val.split('##');
                    CostService.logger.debug(`instanceType: ${instanceType} :: region: ${region}`);
                    priceLists.push(CostService.ec2InstanceCost({ instanceType, region }));
                });
                CostService.logger.debug(`priceLists Length: ${priceLists.length}`);

                const resolvedPriceList = flattenDeep(await Promise.all(priceLists));

                const onDemandPriceDocs = resolvedPriceList.reduce((acc, item) => {
                    const {
                        terms: { OnDemand },
                        product: { attributes },
                    } = JSON.parse(item);
                    const skuKeys = Object.keys(OnDemand);
                    if (skuKeys.length !== 1) {
                        throw new Error(`Expected 1 SKU Key, got ${skuKeys.length}`);
                    }
                    const sku = skuKeys[0];
                    const { regionCode, instanceType } = attributes;
                    const priceDimensionSku = Object.keys(OnDemand[sku].priceDimensions);
                    if (priceDimensionSku.length !== 1) {
                        throw new Error(`Expected 1 SKU Key, got ${priceDimensionSku.length}`);
                    }
                    const {
                        unit,
                        pricePerUnit: { USD },
                    } = OnDemand[sku].priceDimensions[priceDimensionSku[0]];
                    const onDemandInstanceEntity = new OnDemandInstanceEntity({ unit, pricePerUnit: USD });
                    if (!acc[regionCode]) {
                        acc[regionCode] = {};
                    }
                    acc[regionCode][instanceType] = onDemandInstanceEntity;
                    return acc;
                }, {});
                // Build a cost document input for each instance
                // Calculate the cost for each instance
                CostService.logger.debug(`combinedInstances Length: ${combinedInstances.length}`);
                const entites = combinedInstances.map((instance) => {
                    console.log(instance);
                    const { timeDelta, meteringcoId, podId, cpu, ram } = instance;
                    const unitPrice = EC2CostEntity.determineUnitPrice({
                        instanceType: instance.instanceType,
                        priceDocument: onDemandPriceDocs[instance.region][instance.instanceType],
                        isReserved: instance.isReserved,
                        ReservedInstanceEntity: instance.reservedInstance[0],
                    });
                    CostService.logger.debug(`unitPrice: ${unitPrice}`);
                    const unitCost = EC2CostEntity.calculateCost({ unitPrice, timeDelta });

                    const costEntity = new EC2CostEntity({ businessID, unitCost, meteringcoId, podId, cpu, ram, timeDelta });
                    return costEntity;
                });
                const points = entites.map((entity) => EC2CostEntity.transformer(entity, this.InfluxService));
                const { loadPoints } = this.InfluxService;

                await loadPoints(`${process.env.STAGE}-usage-data`, `meteringco`, points);
            } catch (error) {
                if (parseInt(error.status) === 404) {
                    CostService.logger.warn(`No Services Found for businessID: ${businessID}`);
                    return;
                }
                CostService.logger.error('Error Occurred', error);
            }
        });

        // Load the cost into influx
    }

    async findAggregateCost({ businessID }): Promise<FindCostResponse> {
        const aggregateData = await this.InfluxService.readAverageEBSCost({ businessID });
        if (!aggregateData.length) {
            return {
                data: [],
                message: 'No EBS cost data found. Data is updated every hour, check tags on EBS Volumes.',
            };
        }
        // TODO Read Average Node Cost and return it
        const dto = aggregateData.map((data) => CalculatedEbsCostEntity.dbModelToDTO(data));

        return { message: 'Found Cost Response', data: dto };
    }

    async findCostCompute({ businessID }): Promise<FindCostResponse> {
        const aggregateData = await this.InfluxService.readAverageEC2Cost({ businessID });
        if (!aggregateData.length) {
            return {
                data: [],
                message: 'No EC2 cost data found. Data is updated every hour, check tags on Pods or Instances.',
            };
        }
        // TODO Read Average Node Cost and return it
        const dto = aggregateData.map((data) => EC2CostEntity.averageCostsConverterToDto(data));

        return { message: 'Found Cost Response', data: dto };
    }
}
