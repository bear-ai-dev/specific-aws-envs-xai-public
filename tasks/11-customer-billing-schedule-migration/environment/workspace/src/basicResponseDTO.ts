import { ApiProperty } from '@nestjs/swagger';

export class BasicResponseDTO {
    /**
     * A human readable message describing the operation
     * @example 'Found Customer'
     */
    @ApiProperty()
    public message: string;
}
