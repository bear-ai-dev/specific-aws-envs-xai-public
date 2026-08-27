import { ApiHideProperty, ApiProperty, IntersectionType, OmitType, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DimensionEntity, Numerical } from '../entities/dimensions.entity';
import { CreateDimensionDto } from './create-dimension.dto';
import { BasicResponseDTO } from '../../basicResponseDTO';

import { ReadMeasurementResponseData } from '../../measurement-config/dto/read-measurement-config.dto';

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
    @ApiProperty()
    public dimensionId: string;
}

export class ReadDimensionResponseData extends OmitType(CreateDimensionDto, ['measurementId'] as const) {
    /**
     * Unique identifier assigned by MeteringCo
     */
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
    data: ReadDimensionResponseData[];
}
