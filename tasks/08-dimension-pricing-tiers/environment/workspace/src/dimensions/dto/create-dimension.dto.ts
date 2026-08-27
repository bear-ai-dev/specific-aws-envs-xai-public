import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ApiHideProperty, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import {
    IsDefined,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNotEmptyObject,
    IsNumberString,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
    ValidationArguments,
} from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO.js';
import { DimensionEntity } from '../entities/dimensions.entity.js';
import { EntitlementCanbeInf, EntitlementMustBeSet, ShouldSetConsumptionPrice } from './entitlementValidator.js';
import { NumberStringIsInteger } from './numberStringIsInteger.js';
import { ValidateDecimalPlace } from './validateDecimalPlaces.js';
export enum countBasedUnits {
    'count-based' = 'count-based',
}
export enum aggregationInterval {
    none = 'none',
    hour = 'hour',
    day = 'day',
    month = 'month',
}
export enum aggregationIntervalInMS {
    none = 0,
    hour = 3600000,
    day = 86400000,
    month = 2592000000,
}

export enum SampleType {
    counter = 'counter',
    gauge = 'gauge',
}

/**
 * @author Daniel Wasserlauf <daniel.wasserlauf@meteringco.tech>
 *
 *
 * @enum
 * A critical field for defining which dimensions are accepted as IBD's and which are not
 * If a dimension is not in this list, it cannot be created as an offering.
 * This infrastructureType Enum is used in various places within the codebase to determine and process data for dimensions
 *
 * @example "ebsSnapshot"
 * // This means the dimension is associated with ebsSnapshots, aggregation and data gathering for the dimension will run off of
 *
 * */
export enum infrastructureType {
    podCPUHours = 'podCPUHours',
    ebsVolumeProvisionedCapacity = 'ebsVolumeProvisionedCapacity',
    ebsSnapshot = 'ebsSnapshot',
    reservedInstanceHours = 'reservedInstanceHours',
    instanceRunningTime = 'instanceRunningTime',
    ec2Egress = 'ec2Egress',
    azureVmHours = 'azureVmHours',
}

export enum aggregationMethod {
    sum = 'sum',
    max = 'max',
    min = 'min',
    count = 'count',
    average = 'average',
}

export enum timeBasedUnits {
    second = 'second',
    minute = 'minute',
    hour = 'hour',
    day = 'day',
}

export enum dataBasedUnits {
    byte = 'byte',
    kilobyte = 'kilobyte',
    megabyte = 'megabyte',
    gigabyte = 'gigabyte',
}
export class CountBasedConsumptionUnit {
    @IsEnum(countBasedUnits, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `unit: The value ${value} is not a valid value for the unit field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsNotEmpty()
    @ApiProperty({
        description: 'A dimensionless unit for a dimension of type count-based',
        examples: ['count-based'],
    })
    public unit: countBasedUnits;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        enum: ['count'],
        description: 'A string that indicates the type of consumption unit',
    })
    public type: 'count';
}

export class TimeBasedConsumptionUnit {
    @IsEnum(timeBasedUnits, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `unit: The value ${value} is not a valid value for the unit field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsNotEmpty()
    @ApiProperty({
        enum: timeBasedUnits,
        description: 'A unit of time for a dimension of type time-based',
        examples: ['second', 'minute', 'hour', 'day'],
    })
    public unit: timeBasedUnits;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        enum: ['time'],
        description: 'A string that indicates the type of consumption unit',
    })
    public type: 'time';
}

export class DatabasedConsumptionUnit {
    @IsEnum(dataBasedUnits, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `unit: The value ${value} is not a valid value for the unit field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsNotEmpty()
    @ApiProperty({
        enum: dataBasedUnits,
        description: 'A unit of data for a dimension of type data-based',
        examples: ['byte', 'kilobyte', 'megabyte', 'gigabyte'],
    })
    public unit: dataBasedUnits;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        enum: ['data'],
        description: 'A string that indicates the type of consumption unit',
    })
    public type: 'data';
}

export enum roundingEnum {
    round = 'round',
    floor = 'floor',
    ceiling = 'ceiling',
}

export enum overageAllowedEnum {
    true = 'true',
    false = 'false',
}
export class CreateDimensionDto {
    /**
     *
     * A friendly, human-readable name for the dimension.
     * <br><br>
     * Example `"API Call"`
     */

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        examples: ['API Call', 'CPU Hours', 'Provisioned Capacity'],
    })
    public dimensionName: string;

    /**
     * Consumption unit of the dimension.
     * MeteringCo supports three types of consumption units: count-based, time-based, and data-based.
     * Supported values for each consumption unit type are listed below. <br>
     * - count: `"count-based"` <br>
     * - time-based: `"second"`, `"minute"`, `"hour"`, `"day"` <br>
     * - data-based: `"byte"`, `"kilobyte"`, `"megabyte"`, `"gigabyte"` <br>
     *
     * This field accepts a JSON object with the following schema: <br>
     * ```
     * { "type": "typeName", "unit": "unitName" }
     * ```
     * <br><br>
     * Example: <br>
     * `{ "type": "count", "unit": "count-based" }` <br>
     * `{ "type": "time", "unit": "hour" }` <br>
     * `{ "type": "data", "unit": "byte" }` <br>
     */
    @IsDefined()
    @IsNotEmptyObject()
    @IsObject()
    @ValidateNested({ each: true })
    @Type(({ object }) => {
        const { consumptionUnit } = object;
        if (consumptionUnit) {
            const { type } = consumptionUnit;
            if (type.toLowerCase() === 'count') return CountBasedConsumptionUnit;
            if (type.toLowerCase() === 'time') return TimeBasedConsumptionUnit;
            if (type.toLowerCase() === 'data') return DatabasedConsumptionUnit;
            else throw new BadRequestException("Invalid Consumption type must be 'count', 'time', or 'data'");
        } else {
            throw new BadRequestException('Invalid consumptionUnit the fields type and unit must be set');
        }
    })
    @ApiProperty({
        oneOf: [
            { $ref: getSchemaPath('CountBasedConsumptionUnit') },
            { $ref: getSchemaPath('TimeBasedConsumptionUnit') },
            { $ref: getSchemaPath('DatabasedConsumptionUnit') },
        ],
    })
    public consumptionUnit: CountBasedConsumptionUnit | TimeBasedConsumptionUnit | DatabasedConsumptionUnit;

    /**
     * The minimum increment for usage amount.
     *  As an example, if usage increment is 1 Hour job execution time,
     *  then 1 Hour and 5 Minutes execution time may be calculated as 1 Hour or 2 Hours,
     *  depending on the rounding algorithm field of the dimension.
     *  <br><br>
     * Example `1`
     *
     */

    @IsNumberString()
    @NumberStringIsInteger('usageIncrement')
    @IsNotEmpty()
    @ApiProperty({
        name: 'usageIncrement',
        example: '24',
        type: String,
        required: true,
        externalDocs: {
            description: 'See how usage increment is used in the billing process',
            url: 'https://docs.meteringco.tech/model-pricing-and-package/define-product-metrics#understand-how-billing-aggregation-works',
        },
    })
    public usageIncrement: string;

    /**
     * The rounding algorithm that is used to calculate the amount of usage increment.
     * Ceiling algorithm rounds up, floor algorithm rounds down, the round algrogrithm rounds to the nearest whole integer rounding half away from zero.
     *  As an example, if usage increment is 1 Hour job execution time,
     * then 1 Hour and 5 Minutes execution time may be calculated as 2 Hours for ceiling algorithm, 1 Hour for floor algorithm, and 1 Hour for round algorithm.
     * depending on the rounding algorithm field of the dimension.
     * <br><br>
     **/
    @IsEnum(roundingEnum, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `roundingEnum: The value ${value} is not a valid value for the roundingEnum field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsNotEmpty()
    public rounding: roundingEnum;

    /**
     * Used with Subscription Tier Offering type. <br>
     * SaaS customers subscribed to a subscription tier are entitled to use the amount of product
     * with regard to the dimension up to the value specified in this field.
     * For example, a subscription tier may entitle subscribers to make up to 1,000,000 API requests.
     */
    @EntitlementCanbeInf('usageEntitlement')
    @IsOptional()
    @ApiProperty({
        name: 'usageEntitlement',
        oneOf: [
            {
                type: 'number',
                description:
                    'The number of units that the customer is entitled to use, must be greater than or equal to 0',
                example: 1000000,
            },
            {
                type: 'string',
                format: 'inf',
                description: "The customer is entitled to use the product's dimension without any limit",
                example: 'inf',
            },
        ],
        examples: ['inf', 1000000],
        required: false,
    })
    public usageEntitlement?: number | 'inf';
    /**
     * Used with Subscription Tier Offering type. <br>
     * When the usage entitlement is specified,
     * this field decides if allowing SaaS customers to use more than entitled amount of the product dimension.
     */
    @IsEnum(overageAllowedEnum, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `overageAllowed: The value ${value} is not a valid value for the overageAllowed field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    @IsOptional()
    @EntitlementMustBeSet('overageAllowed')
    public overageAllowed?: overageAllowedEnum;

    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;

    /**
     * The unit price of dimension.
     * Numerical values are represented as strings to avoid precision loss.
     * <br><br>
     *
     * @example "20.00"
     */
    @ShouldSetConsumptionPrice('consumptionPrice')
    @ValidateDecimalPlace('consumptionPrice')
    public consumptionPrice?: string;

    /**
     *
     * The sample type used for the data. Gauge is a value that can go up or down. <br>
     * Currently set to gauge by default on all dimensions, cannot be altered via the API
     * @example "gauge"
     */
    @ApiHideProperty()
    @IsOptional()
    @IsEnum(SampleType, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `sampleType: The value ${value} is not a valid value for the sampleType field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    public sampleType?: SampleType;

    /**
     * Time interval to aggregate dimension usage data for billing.
     * <br><br>
     * Default: `"hour"`
     */
    @ApiProperty({
        name: 'aggregationInterval',
        description: 'Time interval to aggregate dimension usage data for billing. <br><br>',
        example: 'hour',
        type: 'string',
        required: false,
        default: 'hour',
        enum: aggregationInterval,
        externalDocs: {
            description: 'See how aggregation interval is used in the billing process',
            url: 'https://docs.meteringco.tech/model-pricing-and-package/define-product-metrics#understand-how-billing-aggregation-works',
        },
    })
    @IsOptional()
    @IsEnum(aggregationInterval, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `aggregationInterval: The value ${value} is not a valid value for the aggregationInterval field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    public aggregationInterval?: aggregationInterval;

    /**
     * The algorithm to aggregate raw usage data for billing.
     * <br><br>
     */
    @ApiProperty({
        name: 'aggregationMethod',
        example: 'sum',
        type: 'string',
        required: false,
        default: 'max',
        enum: aggregationMethod,
        externalDocs: {
            description: 'See how aggregation method is used in the billing process',
            url: 'https://docs.meteringco.tech/model-pricing-and-package/define-product-metrics#understand-how-billing-aggregation-works',
        },
    })
    @IsOptional()
    @IsEnum(aggregationMethod, {
        message: (args: ValidationArguments) => {
            const { value, constraints } = args;
            const correctValues = Object.values(constraints[0]);
            return `aggregationMethod: The value ${value} is not a valid value for the aggregationMethod field. The correct values are: ${correctValues}`;
        },
        each: true,
    })
    public aggregationMethod?: aggregationMethod;

    /**
     * The unique identifier of the measurement attached to the dimension.
     * */
    @ApiProperty({
        name: 'measurementId',
        description: 'The unique identifier of the measurement attached to the dimension.',
        example: '5f7d1e3a-3b2d-4b0a-8b9a-5b9b5c9b5c9b',
        type: 'string',
        required: false,
    })
    @IsOptional()
    @IsString()
    public measurementId?: string;
    /**
     * An optional key-value map of additional metadata to associate with the dimensions.
     * such as environment, purpose, owner, developer, contract number,
     * or any arbitrary data to be associated with this usage record. Additionally, if `null` is passed for any value in the metadata object it will be removed.
     *  To entirely remove the metadata object, pass null to the metadata field.
     * <br><br>
     * Example `{"environment": "staging", "purpose": "proof-of-concept", "owner": "John Doe", "workspaceId": null}`
     * <br><br>
     * In the above example, the `workspaceId` metadata key will be removed from the dimension. To remove all fields pass the following.
     * <br><br>
     * Example `"metadata": null`
     *
     **/
    @IsObject()
    @IsOptional()
    public metadata?: Record<string, string | number | null>;

    constructor(entity: DimensionEntity) {
        if (entity) {
            const { numerical, measurementId, dimensionName, metadata } = entity;

            if (numerical) {
                const {
                    dimensionUnit,

                    priceSegments,
                    aggregationInterval: argumentAggregationInterval,
                    aggregationMethod: entityAggregationMethod,
                    usageIncrement,
                    rounding,
                    overageAllowed,
                    dimensionUnitType,
                    usageEntitlement,
                } = numerical;
                this.usageIncrement = usageIncrement.toString();
                this.rounding = rounding;
                this.overageAllowed = overageAllowed ? overageAllowed : overageAllowedEnum.false;
                this.consumptionPrice = priceSegments[0].price;
                this.usageEntitlement = usageEntitlement;
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                //@ts-ignore
                this.consumptionUnit = { unit: dimensionUnit, type: dimensionUnitType.toLowerCase() };
                this.aggregationInterval = argumentAggregationInterval
                    ? aggregationInterval[argumentAggregationInterval.toLowerCase()]
                    : aggregationInterval['hour'];
                if (entityAggregationMethod in aggregationMethod) this.aggregationMethod = entityAggregationMethod;
            }
            this.measurementId = measurementId;

            this.dimensionName = dimensionName;
            this.metadata = metadata;
        }
    }
}

export class CreateDimensionResponse extends BasicResponseDTO {
    /**
     * The unique identifier assigned by MeteringCo.
     * <br><br>
     * Example: `"fcb1fa34-8f11-4832-80f2-464cbc7a8546"`
     */
    @ApiProperty({
        example: 'fcb1fa34-8f11-4832-80f2-464cbc7a8546',
        name: 'dimensionId',
    })
    public dimensionId: string;
}

export class UpdateDimensionResponse extends BasicResponseDTO {
    /**
     * The unique identifier assigned by MeteringCo.
     * <br><br>
     * Example: `"fcb1fa34-8f11-4832-80f2-464cbc7a8546"`
     */
    @ApiProperty({
        example: 'fcb1fa34-8f11-4832-80f2-464cbc7a8546',
        name: 'dimensionId',
    })
    public dimensionId: string;
    @ApiProperty({
        example: 'loaded dimension update',
        name: 'message',
    })
    public declare message: 'loaded dimension update';
}
