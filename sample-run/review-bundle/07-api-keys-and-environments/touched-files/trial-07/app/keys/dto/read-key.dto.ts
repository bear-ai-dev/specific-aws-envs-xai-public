import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

export class KeyResponseData {
    /**
     * The identifier of the machine credential.
     * <br><br>
     * Example: `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty()
    public keyId: string;

    /**
     * A human readable name for the credential.
     * <br><br>
     * Example: `"Harborline production ingest"`
     * @example "Harborline production ingest"
     */
    @ApiProperty()
    public name?: string;

    /**
     * The newly issued secret. Only present after rotation.
     * <br><br>
     * Example: `"sk_fc202a83e5d8113b10ac5152b27636613a830859"`
     * @example "sk_fc202a83e5d8113b10ac5152b27636613a830859"
     */
    @ApiProperty({ required: false })
    public clientSecret?: string;

    constructor({ keyId, name, clientSecret }: { keyId: string; name?: string; clientSecret?: string }) {
        this.keyId = keyId;
        this.name = name;
        if (clientSecret) {
            this.clientSecret = clientSecret;
        }
    }
}

export class ReadKeysResponse extends BasicResponseDTO {
    @ApiProperty({ type: [KeyResponseData] })
    public data: KeyResponseData[];
}

export class RotateKeyResponse extends BasicResponseDTO {
    @ApiProperty({ type: KeyResponseData })
    public data: KeyResponseData;
}
