import { BadRequestException } from '@nestjs/common';
import { ApiHideProperty, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsString,
    IsOptional,
    IsNotEmpty,
    ValidateNested,
    IsDefined,
    IsNotEmptyObject,
    IsObject,
    Matches,
} from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO';
import {
    MeasurementConfigEntity,
    InfrastructureAccessInformation,
    AgentAccessInformation,
    DatastoreAccessInformation,
} from '../entities/measurement-config.entity';

/**
 *
 * @enum The current list of supported measurement modes.
 * Currently some modes like API/Agent require out of meteringco-backend requirements to be fulfilled.
 * Like the deployment of the Agent.
 *
 * @example "agentBased"
 * @example "infrastructureBased"
 */
export enum measurementMode {
    infrastructureBased = 'infrastructureBased',
    agentBased = 'agentBased',
    datastoreBased = 'datastoreBased',
}

export class CreateMeasurementConfigDto {
    /**
     * The measurement method.
     * See <a href="https://docs.meteringco.tech/measure-usage-and-collect-data/measure-and-collect-usage-data-at-production-scale">Measure and Collect Usage Data at Production Scale</a> for more information.
     * <br><br>
     * Example `"agentBased"`
     */
    @Matches(
        `^${Object.values(measurementMode)
            .filter((v) => typeof v !== 'number')
            .join('|')}$`,
        'i'
    )
    @IsNotEmpty()
    @ApiProperty({ enum: measurementMode, isArray: false, example: 'infrastructureBased' })
    public measurementMode: measurementMode;

    /**
     * The businessID associated with your account, not needed for full accounts, this is gathered during authentication
     * @example 'My Cool Corp'
     *
     **/
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;

    /**
     * Configuration for the measurement method.
     */
    @ApiProperty({
        type: 'object',

        oneOf: [
            { $ref: getSchemaPath('InfrastructureAccessInformation') },
            { $ref: getSchemaPath('AgentAccessInformation') },
            { $ref: getSchemaPath('DatastoreAccessInformation') },
        ],
    })
    @IsDefined()
    @IsNotEmptyObject()
    @IsObject()
    @ValidateNested({ each: true })
    @Type(({ object }) => {
        if (!object?.measurementMode) {
            throw new BadRequestException(
                'measurementMode must be provided, value must be either "infrastructure" or "agent" '
            );
        }
        if (object.measurementMode.toLowerCase() === measurementMode.infrastructureBased.toLowerCase())
            return InfrastructureAccessInformation;
        else if (object.measurementMode.toLowerCase() === measurementMode.agentBased.toLowerCase())
            return AgentAccessInformation;
        else if (object.measurementMode.toLowerCase() === measurementMode.datastoreBased.toLowerCase())
            return DatastoreAccessInformation;
        // Handle edge case where the previous ifs are not fullfiled
    })
    public measurementConfiguration:
        | InfrastructureAccessInformation
        | AgentAccessInformation
        | DatastoreAccessInformation;

    /**
     * A friendly, human-readable name of the measurement.
     */
    @IsString()
    @IsOptional()
    public measurementName?: string;
}

export class CreateMeasurementConfigurationResponse extends BasicResponseDTO {
    /**
     * Unique identifier assigned by MeteringCo
     */
    public measurementId: MeasurementConfigEntity['measurementId'];
}
