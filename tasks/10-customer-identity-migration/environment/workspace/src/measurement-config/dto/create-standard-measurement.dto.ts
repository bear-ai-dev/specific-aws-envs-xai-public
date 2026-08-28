import { ApiHideProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsObject, IsRFC3339, IsNumberString, IsAscii } from 'class-validator';

import { ValidServiceApplicationID } from './measurementIdOrApplicationIdValidator';
import { ServiceIdExists } from '../../services/dto/serviceIdExists';
import { DimensionIdExists } from '../../dimensions/dto/dimensionIdExists';

export class CreateStandardMeasurementDto {
    /**
     * The businessID associated with your account, not needed for full accounts, this is gathered during authentication
     * @example 'My Cool Corp'
     *
     **/
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID: string;

    /**
     * The timestamp of usage record in <a href="https://ijmacd.github.io/rfc3339-iso8601/">RFC3339</a>
     * format with a 4-digit year.
     * This is the time the usage occurred, or the end of the usage period.
     * <br><br>
     * Example: `"2023-02-08T19:24:10Z"`
     *
     **/
    @IsRFC3339()
    @IsString()
    @IsNotEmpty()
    public timeStamp: string;

    /**
     * Conditionally REQUIRED.<br>
     * The application ID of a service this usage record attributes to.
     * This field is required if the `serviceId` is not provided.
     * If both are provided the `serviceId` takes precedence
     * and both  persist in usage records.
     * <br><br>
     * Example: `"e8366954-6f36-47e9-8431-ac95f88b5cc7"`
     *
     **/
    @IsString()
    @IsOptional()
    @IsAscii()
    public applicationId?: string;

    /**
     * Conditionally REQUIRED.<br>
     * The service ID of a service this usage record attributes to.
     * This field is required if the `applicationId` is not provided.
     * If both are provided the `serviceId` takes precedence
     * and both persist in usage records.
     * <br><br>
     * Example: `'e8366954-6f36-47e9-8431-ac95f88b5cc7'`
     *
     **/
    @ValidServiceApplicationID('serviceId', {
        message: 'Must provide either a serviceId or a applicationId',
    })
    @ServiceIdExists('serviceId')
    public serviceId?: string;

    /**
     * The unique identifier of the dimension this usage record is associated with.
     * <br><br>
     * Example: `'da9611bd-e0f3-4c0d-a754-fda5be730872'`
     *
     **/
    @IsString()
    @IsNotEmpty()
    @DimensionIdExists('dimensionId')
    public dimensionId?: string;

    /**
     * The amount of the usage on this record.
     * Numerical values are represented as strings to avoid precision loss.
     * <br><br>
     * Example: `"0.87"`
     **/
    @IsNumberString()
    @IsString()
    public recordValue: string;

    /**
     * An optional key-value map of additional metadata to associate with this usage record.
     * Additional metadata to be stored on the usage record,
     * such as environment, purpose, owner, developer, contract number,
     * or any arbitrary data to be associated with this usage record.
     * Metadata can be used for analytics purpose.
     * <br><br>
     * Example `{"environment": "staging", "purpose": "proof-of-concept", "owner": "John Doe"}`
     **/
    @IsObject()
    @IsOptional()
    public metadata: Record<string, string>;

    constructor(doc) {
        if (doc) {
            this.businessID = doc.businessID;
            this.timeStamp = doc.timeStamp;
            this.applicationId = doc.applicationId;
            this.serviceId = doc.serviceId;
            this.dimensionId = doc.dimensionId;
            this.recordValue = doc.recordValue;
            this.metadata = doc.metadata;
        }
    }
}
