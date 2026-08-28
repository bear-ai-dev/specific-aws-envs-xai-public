import { Logger } from '@nestjs/common';
import { ApiHideProperty, ApiProperty, getSchemaPath, OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumberString, IsObject, IsOptional, IsRFC3339, IsString, IsUUID } from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO';
import { ReadCustomerResponseData } from '../../customer/dto/read-customer.dto';
import { aggregationInterval } from '../../dimensions/dto/create-dimension.dto';
import { ReadDimensionDto } from '../../dimensions/dto/read-dimension.dto';
import { CreateStandardMeasurementDto } from '../../measurement-config/dto/create-standard-measurement.dto';
import { ReadOfferingResponseData } from '../../offering/dto/readOffering.dto';
import { UsageDocument } from '../../usage/dto/read-usage.dto';
import { ServiceEntity } from '../entities/service.entity';
import { CreateServiceDto } from './createService.dto';

export class ReadServiceDTO {
    private static readonly logger = new Logger(ReadServiceDTO.name);
    // BusinessID used for lookup (Unique ID for business)
    @IsString()
    @IsNotEmpty()
    @ApiHideProperty()
    public businessID: string;

    // Client ID for the invoice used for lookup
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    public serviceId?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    public offeringId?: string;

    static getServiceEntityDTO(dbServiceEntity: Array<any> = []): Array<CreateServiceDto> {
        const filteredEntities = dbServiceEntity.filter((entity) => {
            const { _measurement } = entity;
            if (_measurement === ServiceEntity._measurement) {
                return true;
            } else {
                ReadServiceDTO.logger.warn('Unknown Measurement Type found in response removing element in filter', {
                    entity,
                    _measurement,
                });
                return false;
            }
        }, []);
        const dto = filteredEntities.map((entity) => new CreateServiceDto(ServiceEntity.dbModelToEntity(entity)));

        if (dto) {
            return dto;
        }
    }
}

export class QueryParamUsageDto {
    /**
     * The end time of the time range to query.
     * The time range is inclusive of the start time and exclusive of the end time.
     * The end time must be after the start time.
     * The end time must be before the current time.
     * The end time must be in <a href="https://ijmacd.github.io/rfc3339-iso8601/">RFC3339</a> format.
     * <br><br>
     * Example: `"2020-01-01T00:00:00Z"`
     */
    @IsRFC3339()
    @IsNotEmpty()
    @IsOptional()
    public endTime?: string;

    /**
     * The end time of the time range to query.
     * The time range is inclusive of the start time and exclusive of the end time.
     * The end time must be after the start time.
     * The end time must be before the current time.
     * The end time must be in <a href="https://ijmacd.github.io/rfc3339-iso8601/">RFC3339</a> format.
     * <br><br>
     * Example: `"2020-01-01T00:00:00Z"`
     */
    @IsRFC3339()
    @IsNotEmpty()
    @IsOptional()
    public startTime?: string;

    /**
     * The aggregation interval to use for the query.
     * <br><br>
     * Default: the aggregation interval defined in the dimension definition.
     */
    @ApiProperty()
    @IsOptional()
    @IsEnum(aggregationInterval)
    public aggregationInterval?: aggregationInterval;
}

export class ReadServiceResponse extends BasicResponseDTO {
    public data: ReadServiceResponseData[];
}
export class ReadServiceResponseData extends OmitType(CreateServiceDto, ['offeringId', 'customerId'] as const) {
    public offering: ReadOfferingResponseData;
    public customer: ReadCustomerResponseData;

    /**
     * Unique identifier assigned by MeteringCo. This service ID can be used to link measurement data with services. For example, the measured usage data can have metadata with key `meteringcoServiceId` and value `e88595c2-abec-4a86-af34-daad942ae0c5`.
     *
     * @example 'e88595c2-abec-4a86-af34-daad942ae0c5'
     *
     *
     **/
    @IsUUID()
    public serviceId?: string;
}

export class UsageResponseDocument {
    /**
     * The usage record value for the given dimension and time interval.
     * Numerical values are represented as strings to avoid precision loss.
     * <br><br>
     * Example `"0.67"`
     *
     */
    public value?: UsageDocument['value'];
    /**
     * The start time of the time interval in ISO8601 format.
     * <br><br>
     * Example `"2021-01-01T00:00:00.000Z"`
     *
     * */
    public startTime?: UsageDocument['startTime'];
    /**
     * The end time of the time interval in ISO8601 format.
     * <br><br>
     * Example `"2021-01-01T00:00:00.000Z"`
     * */
    public endTime?: UsageDocument['endTime'];
}

export class AggregatedUsageResponse {
    /**
     * The unique identifier of a dimension.
     */
    public dimensionId: ReadDimensionDto['dimensionId'];
    /**
     * Array of usage records group by aggregation time interval
     **/
    public usage: Array<UsageResponseDocument>;
}
export class BasicUsageDocument {
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
     * The amount of the usage on this record.
     * Numerical values are represented as strings to avoid precision loss.
     * <br><br>
     * Example: `"0.87"`
     **/
    @IsNumberString()
    @IsString()
    public recordValue: number;

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
}

export class UnAggregatedUsageResponse {
    /**
     * The unique identifier of a dimension.
     */
    public dimensionId: ReadDimensionDto['dimensionId'];
    /**
     * Array of usage records group by aggregation time interval
     **/
    public usage: Array<BasicUsageDocument>;
}
export class ReadServiceUsageData extends BasicResponseDTO {
    /**
     *
     * The usage data for the given service. If the query parameter `aggregationInterval=none` is passed in the raw usage data is returned, as an UnAggregatedUsageResponse.
     * <br><br>
     * Otherwise, the usage data is aggregated by the given aggregationInterval and returned as an AggregatedUsageResponse.
     */
    @ApiProperty({
        type: 'object',

        oneOf: [
            { $ref: getSchemaPath('AggregatedUsageResponse') },
            { $ref: getSchemaPath('UnAggregatedUsageResponse') },
        ],
    })
    public data: Array<AggregatedUsageResponse | UnAggregatedUsageResponse>;
}
