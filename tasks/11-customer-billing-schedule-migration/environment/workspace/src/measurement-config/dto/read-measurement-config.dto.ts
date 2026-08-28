import { ApiHideProperty, ApiProperty, PickType, IntersectionType, OmitType, getSchemaPath } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO';
import { DimensionEntity } from '../../dimensions/entities/dimensions.entity';
import {
    AgentAccessInformation,
    DatastoreAccessInformation,
    InfrastructureAccessInformation,
    MeasurementConfigEntity,
} from '../entities/measurement-config.entity';
import { CreateMeasurementConfigDto } from './create-measurement-config.dto';

export class DatastoreAccessInformationResponse extends DatastoreAccessInformation {
    /**
     * The Ingestion endpioint for data to be dropped off at.
     */
    @ApiProperty()
    public ingestion: string;

    /**
     * The DLQ endpoint for data which has failed to be processed.
     */
    @ApiProperty()
    public dlq: string;

    /**
     * The IAM role associated with the endpoints for access management
     */
    @ApiProperty()
    public iamRoleArn: string;
    /**
     * The externalId associated with the endpoints
     */
    @ApiProperty()
    public externalId: string;

    /**
     * The region associated with the endpoints, defaults to `us-east-1`
     */
    @ApiProperty()
    public region: string;
}

export class ReadMeasurementConfigDto {
    /**
     *
     * The unique Identifier for the measurement
     *
     */
    @IsString()
    @IsOptional()
    public measurementId: MeasurementConfigEntity['measurementId'];

    /**businessID
     * The businessID associated with your account, not needed for full accounts, this is gathered during authentication
     * @example 'My Cool Corp'
     *
     **/
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID: string;
}

export class ReadAllMeasurementConfigs extends OmitType(ReadMeasurementConfigDto, ['measurementId'] as const) {}

export class ReadMeasurementConfigByDimensionDto {
    /**
     *
     * The unique Identifier for the dimension associated with the measurement
     * @example 970a0d26-ec63-428e-955b-660ba1ab75c2
     *
     */
    @IsString()
    @IsOptional()
    public dimensionId: DimensionEntity['dimensionId'];

    /**
     * The businessID associated with your account, not needed for full accounts, this is gathered during authentication
     * @example 'My Cool Corp'
     *
     **/
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;
}
export class ReadMeasurementConfigResponse extends BasicResponseDTO {
    /**
     * Array of measurements
     *
     */
    @ApiProperty()
    public data: Array<ReadMeasurementResponseData>;

    public static entityToReadResponse(measumrentConfiEntities: Array<MeasurementConfigEntity>) {
        return {
            message: 'Found Measurements',
            data: measumrentConfiEntities.map(
                ({
                    measurementConfiguration,
                    measurementMode: argumentMeasurementMode,
                    measurementId,
                    measurementName,
                }) => ({
                    measurementConfiguration,
                    measurementMode: argumentMeasurementMode,
                    measurementId,
                    measurementName,
                })
            ),
        };
    }
}

export class MeasurementResponseEntityEnricher extends PickType(MeasurementConfigEntity, ['measurementId'] as const) {}

export class ReadMeasurementResponseData extends IntersectionType(
    CreateMeasurementConfigDto,
    MeasurementResponseEntityEnricher
) {
    @ApiProperty({
        type: 'object',

        oneOf: [
            { $ref: getSchemaPath('InfrastructureAccessInformation') },
            { $ref: getSchemaPath('AgentAccessInformation') },
            { $ref: getSchemaPath('DatastoreAccessInformationResponse') },
        ],
    })
    public measurementConfiguration:
        | InfrastructureAccessInformation
        | AgentAccessInformation
        | DatastoreAccessInformationResponse;
}
