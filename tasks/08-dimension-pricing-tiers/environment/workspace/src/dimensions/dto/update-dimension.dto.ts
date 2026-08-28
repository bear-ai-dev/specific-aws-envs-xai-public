import { ApiHideProperty, ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateDimensionDto } from './create-dimension.dto.js';
import { IsUUID, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class UpdateDimensionDto extends PartialType(CreateDimensionDto) {
    /**
     * The Unique ID defining the dimension document
     * @example "abasd123-bbbb-aaaa-4444-777955dfffff"
     */
    @IsUUID()
    @IsOptional()
    @ApiHideProperty()
    public dimensionId: string;

    /**
     * The Unique ID associated with your specific business account
     * @example myCoolCorp
     */
    @ApiHideProperty()
    @IsString()
    @IsOptional()
    public businessID?: string;
}
