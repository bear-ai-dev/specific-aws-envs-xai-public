import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

export class KeyDto {
    /**
     * The identifier of the machine credential.
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty()
    client_id: string;

    /**
     * The display name of the machine credential.
     * <br><br>
     * Example `"Harborline production ingest"`
     * @example "Harborline production ingest"
     */
    @ApiProperty()
    name?: string;

    /**
     * The identity-provider application type.
     * <br><br>
     * Example `"non_interactive"`
     * @example "non_interactive"
     */
    @ApiProperty()
    app_type?: string;

    /**
     * The subject the credential signs in as.
     * <br><br>
     * Example `"keyHarborlineProdIngest@clients"`
     * @example "keyHarborlineProdIngest@clients"
     */
    @ApiProperty()
    subject?: string;

    /**
     * The freshly minted secret. Only present immediately after rotation.
     */
    @ApiProperty({ required: false })
    client_secret?: string;
}

export class ReadKeysResponse extends BasicResponseDTO {
    @ApiProperty({ type: [KeyDto] })
    public data: KeyDto[];
}

export class RotateKeyResponse extends BasicResponseDTO {
    @ApiProperty()
    public client_id: string;

    @ApiProperty()
    public client_secret: string;
}
