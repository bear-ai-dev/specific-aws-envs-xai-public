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
    public keyId: string;

    /**
     * The display name of the machine credential
     * <br><br>
     * Example `"Harborline production ingest"`
     * @example "Harborline production ingest"
     */
    @ApiProperty()
    public name: string;

    constructor({ keyId, name }: { keyId: string; name: string }) {
        this.keyId = keyId;
        this.name = name;
    }
}

export class ReadKeysResponse extends BasicResponseDTO {
    @ApiProperty({ type: [KeyDto] })
    public data: KeyDto[];

    constructor({ message, data }: { message: string; data: KeyDto[] }) {
        super();
        this.message = message;
        this.data = data;
    }
}

export class RotateKeyResponse extends BasicResponseDTO {
    /**
     * The identifier of the machine credential whose secret was rotated
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty()
    public keyId: string;

    /**
     * The freshly issued secret. The previous secret is refused from this moment.
     * <br><br>
     * Example `"sk_abc123"`
     * @example "sk_abc123"
     */
    @ApiProperty()
    public clientSecret: string;

    constructor({ message, keyId, clientSecret }: { message: string; keyId: string; clientSecret: string }) {
        super();
        this.message = message;
        this.keyId = keyId;
        this.clientSecret = clientSecret;
    }
}
