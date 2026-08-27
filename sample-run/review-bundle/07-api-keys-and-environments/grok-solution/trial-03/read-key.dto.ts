import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

export class KeyDto {
    /**
     * The machine credential identifier (Auth0 client_id)
     * @example keyHarborlineProdIngest
     */
    @ApiProperty()
    public keyId: string;

    /**
     * Display name of the credential
     * @example Harborline production ingest
     */
    @ApiProperty()
    public name: string;

    /**
     * Application type of the credential
     * @example non_interactive
     */
    @ApiProperty()
    public appType: string;

    /**
     * Fresh secret, only present immediately after a rotation
     */
    @ApiProperty({ required: false })
    public clientSecret?: string;

    constructor({
        keyId,
        name,
        appType,
        clientSecret,
    }: {
        keyId: string;
        name: string;
        appType: string;
        clientSecret?: string;
    }) {
        this.keyId = keyId;
        this.name = name;
        this.appType = appType;
        this.clientSecret = clientSecret;
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
    @ApiProperty({ type: KeyDto })
    public data: KeyDto;

    constructor({ message, data }: { message: string; data: KeyDto }) {
        super();
        this.message = message;
        this.data = data;
    }
}
