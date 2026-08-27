import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

/**
 * A machine credential belonging to the current account in the current environment.
 */
export class KeyDto {
    /**
     * The client identifier of the machine credential.
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty({ example: 'keyHarborlineProdIngest' })
    client_id: string;

    /**
     * A human readable name for the credential.
     * <br><br>
     * Example `"Harborline production ingest"`
     * @example "Harborline production ingest"
     */
    @ApiProperty({ example: 'Harborline production ingest' })
    name: string;

    /**
     * The Auth0 application type. Machine credentials are non_interactive.
     * <br><br>
     * Example `"non_interactive"`
     * @example "non_interactive"
     */
    @ApiProperty({ example: 'non_interactive' })
    app_type: string;
}

/**
 * The response for listing the machine credentials held by the current account.
 */
export class ReadKeysResponseDto extends BasicResponseDTO {
    /**
     * The machine credentials belonging to the current account in the current environment.
     */
    @ApiProperty({ type: [KeyDto] })
    data: KeyDto[];
}

/**
 * The response for rotating a machine credential secret.
 */
export class RotateKeyResponseDto extends BasicResponseDTO {
    /**
     * The newly issued client secret. Shown only at rotation time.
     * <br><br>
     * Example `"sk_fc202a83e5d8113b10ac5152b27636613a830859"`
     * @example "sk_fc202a83e5d8113b10ac5152b27636613a830859"
     */
    @ApiProperty({ example: 'sk_fc202a83e5d8113b10ac5152b27636613a830859' })
    client_secret?: string;

    /**
     * The client identifier of the rotated credential.
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty({ example: 'keyHarborlineProdIngest' })
    client_id?: string;
}
