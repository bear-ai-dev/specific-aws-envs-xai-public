import { InfluxService } from '../../influx/influx.service';
import { UsageEntity } from '../../usage/entities/usage.entity';
import { StandardMeasurementEntity } from './standardMeasurement.entity';

export enum PreProcessorMeasurementType {
    AGENT = 'AGENT',
}

// Take in a raw data value which doesn't have serviceId, and or DimesnionId plus additional metadata
// Attach meatadata to the raw data value creating a standard measurement
// Publish the standard measurement to the standard measurement topic
// Contains a constructor to create the pre-processing entity, and then a method to process the raw data value doing the above steps.
export class StandardMeasurementPreProcessorEntity {
    // The raw data value
    public rawDataValue: string;
    // The businessID
    public businessID: string;
    // ENUM of the type of measurement
    public measurementType: PreProcessorMeasurementType;
    // metadata as a JSON object keys are the metadata names values are strings
    public metadata: Record<string, string>;
    // Optional Timestamp, if not provided will be set to the current time
    public timeStamp?: string;

    constructor(
        rawDataValue: string,
        businessID: string,
        measurementType: PreProcessorMeasurementType,
        metadata: Record<string, string>,
        timeStamp?: string
    ) {
        this.rawDataValue = rawDataValue;
        this.businessID = businessID;
        this.measurementType = measurementType;
        this.metadata = metadata;
        if (timeStamp) {
            this.timeStamp = timeStamp;
        } else {
            this.timeStamp = new Date().toISOString();
        }
    }
    static async createStandardMeasurement(
        preprocessed: StandardMeasurementPreProcessorEntity,
        uniqueInfrastructureId: string,
        influxService: InfluxService
    ) {
        let dimensionId;
        let serviceId;
        let applicationId;
        if (preprocessed.measurementType === PreProcessorMeasurementType.AGENT) {
            const startTime = new Date('January 1, 1970 00:00:00');
            const endTime = new Date();
            // get the dimensionId, and serviceId from Influx
            const data = await influxService.getLatestPodLabelsByID({
                podId: uniqueInfrastructureId,
                businessID: preprocessed.businessID,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
            });
            if (data.length > 0) {
                const [{ label_meteringco_application_id, label_meteringco_dimension_id, label_meteringco_service_id }] = data;
                dimensionId = label_meteringco_dimension_id;
                serviceId = label_meteringco_service_id;
                applicationId = label_meteringco_application_id;
            } else {
                return { message: 'No labels found' };
            }
        }
        //
        const standardMeasurement = new StandardMeasurementEntity({
            businessID: preprocessed.businessID,
            recordValue: Number(preprocessed.rawDataValue),
            metadata: preprocessed.metadata,
            _measurement: UsageEntity._measurement,
            timeStamp: preprocessed.timeStamp,
            dimensionId,
            serviceId,
            applicationId,
        });
        StandardMeasurementEntity.publish(standardMeasurement);
    }
}
