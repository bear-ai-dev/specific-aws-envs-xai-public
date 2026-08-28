import { ApiHideProperty, ApiProperty, IntersectionType, OmitType, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DimensionEntity, Numerical } from '../entities/dimensions.entity.js';
import { CreateDimensionDto } from './create-dimension.dto.js';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

import { ReadMeasurementResponseData } from '../../measurement-config/dto/read-measurement-config.dto.js';

export class ReadDimensionDto {
    /**
     * The Unique ID associated with your specific business account
     * @example "myCoolCorp"
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID: string;

    /**
     * The unique ID for a dimension
     * @example "12340-abcfe-asdh24-asdhfj"
     */
    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        name: 'dimensionId',
        type: String,
        example: '8a7b5f91-3b85-4cf4-8585-dcdf17f49004',
        description: 'The unique ID for a dimension',
    })
    public dimensionId: string;
}

export class ReadDimensionResponseData extends OmitType(CreateDimensionDto, ['measurementId'] as const) {
    /**
     * The unique identifier of the dimension assigned by MeteringCoaaS
     */
    @ApiProperty({
        name: 'dimensionId',
        type: String,
        example: '8a7b5f91-3b85-4cf4-8585-dcdf17f49004',
        description: 'The unique ID for a dimension',
    })
    dimensionId: DimensionEntity['dimensionId'];
    /**
     * The measurement attached to the dimension
     */
    measurement?: ReadMeasurementResponseData;
}

export class ReadDimensionResponse extends BasicResponseDTO {
    /**
     * Array of dimensions
     */
    @ApiProperty({ minItems: 0 })
    data: ReadDimensionResponseData[];
}
