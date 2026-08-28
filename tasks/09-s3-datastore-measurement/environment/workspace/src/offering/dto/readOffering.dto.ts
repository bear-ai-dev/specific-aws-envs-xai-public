import { Logger } from '@nestjs/common';
import { OmitType } from '@nestjs/swagger';

import { IsNotEmpty, IsString } from 'class-validator';
import { BasicResponseDTO } from '../../basicResponseDTO';
import { ReadDimensionResponseData } from '../../dimensions/dto/read-dimension.dto';
import { CreateOfferingDTO } from './createOffering.dto';

export class ReadPricingDTO {
    private static readonly logger = new Logger(ReadPricingDTO.name);
    // BusinessID used for lookup (Unique ID for business)
    @IsString()
    @IsNotEmpty()
    public businessID: string;

    // Client ID for the invoice used for lookup
    @IsString()
    @IsNotEmpty()
    public offeringId: string;
}

export class ReadOfferingResponseData extends OmitType(CreateOfferingDTO, ['dimensionIds'] as const) {
    /**
     * Unique identifier assigned by MeteringCo.
     *
     * @example "539b7f74-3832-474e-a955-6d69c5df12d0"
     */
    public offeringId: string;

    /**
     * The list of dimensions attached to the offering.
     *
     */
    public dimensions: Array<ReadDimensionResponseData>;
}

export class ReadOfferingResponseDTO extends BasicResponseDTO {
    /**
     * A list of offerings
     *
     */
    public data: Array<ReadOfferingResponseData>;
}
