import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

export class KeyDto {
    /**
     * The identifier of the machine credential
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty()
    keyId: string;

    /**
     * The display name of the machine credential
     * <br><br>
     * Example `"Harborline production ingest"`
     * @example "Harborline production ingest"
     */
    @ApiProperty()
    name: string;

    /**
     * The identity-provider client id of the machine credential
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty()
    clientId: string;
}

export class RotatedKeyDto extends KeyDto {
    /**
     * The newly issued secret. Shown only at rotation time.
     */
    @ApiProperty()
    clientSecret: string;
}

export class ReadKeysResponseDto extends BasicResponseDTO {
    @ApiProperty({ type: [KeyDto] })
    data: KeyDto[];
}

export class RotateKeyResponseDto extends BasicResponseDTO {
    @ApiProperty({ type: [RotatedKeyDto] })
    data: RotatedKeyDto[];
}
