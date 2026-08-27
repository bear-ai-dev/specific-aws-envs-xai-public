import { BadRequestException } from '@nestjs/common';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
import { BasicResponseDTO } from '../../basicResponseDTO';
import { DimensionEntity } from '../entities/dimensions.entity';
export enum countBasedUnits {
    'count-based' = 'count-based',
}
export enum aggregationInterval {
    none = 'none',
    hour = 'hour',
    day = 'day',
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
    public unit: countBasedUnits;

    @IsString()
    @IsNotEmpty()
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
    public unit: timeBasedUnits;

    @IsString()
    @IsNotEmpty()
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
    public unit: dataBasedUnits;

    @IsString()
    @IsNotEmpty()
    public type: 'data';
}

export enum roundingEnum {
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
    public dimensionName: string;

    /**
     * Consumption unit of the dimension.
     * MeteringCo supports three types of consumption units: count-based, time-based, and data-based.
     * Supported values for each consumption unit type are listed below. <br>
     * - count-based: `"count"` <br>
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
    @IsInt()
    @IsNotEmpty()
    public usageIncrement: number;

    /**
     * The rounding algorithm that is used to calculate the amount of usage increment.
     * Ceiling algorithm rounds up and floor algorithm rounds down. As an example, if usage increment is 1 Hour job execution time,
     * then 1 Hour and 5 Minutes execution time may be calculated as 1 Hour or 2 Hours,
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
    @IsInt()
    @IsOptional()
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
    @IsNumberString()
    @IsNotEmpty()
    public consumptionPrice: string;

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
    @ApiProperty()
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
     * Default: `"max"`
     */
    @ApiProperty()
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
    @ApiProperty()
    @IsOptional()
    @IsString()
    public measurementId?: string;

    constructor(entity: DimensionEntity) {
        if (entity) {
            const { numerical, measurementId, dimensionName } = entity;

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
                this.usageIncrement = usageIncrement;
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
        }
    }
}

export class CreateDimensionResponse extends BasicResponseDTO {
    /**
     * The unique identifier assigned by MeteringCo.
     * <br><br>
     * Example: `"fcb1fa34-8f11-4832-80f2-464cbc7a8546"`
     */
    public dimensionId: string;
}
