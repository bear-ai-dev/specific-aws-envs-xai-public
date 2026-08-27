import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

/**
 * A machine credential belonging to the current account and environment
 */
export class ReadKeyDto {
    /**
     * The identity-provider client identifier for this credential
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty()
    public keyId: string;

    /**
     * The identity-provider client identifier for this credential
     * <br><br>
     * Example `"keyHarborlineProdIngest"`
     * @example "keyHarborlineProdIngest"
     */
    @ApiProperty()
    public client_id: string;

    /**
     * The subject this credential signs in as
     * <br><br>
     * Example `"keyHarborlineProdIngest@clients"`
     * @example "keyHarborlineProdIngest@clients"
     */
    @ApiProperty()
    public subject: string;

    /**
     * A human readable name for the credential when the identity provider supplies one
     * <br><br>
     * Example `"Harborline production ingest"`
     * @example "Harborline production ingest"
     */
    @ApiProperty({ required: false })
    public name?: string;

    constructor({
        keyId,
        client_id,
        subject,
        name,
    }: {
        keyId: string;
        client_id: string;
        subject: string;
        name?: string;
    }) {
        this.keyId = keyId;
        this.client_id = client_id;
        this.subject = subject;
        this.name = name;
    }
}

/**
 * The list of machine credentials the current account holds in the current environment
 */
export class ReadKeysResponse extends BasicResponseDTO {
    @ApiProperty({ type: [ReadKeyDto] })
    public data: ReadKeyDto[];

    constructor({ message, data }: { message: string; data: ReadKeyDto[] }) {
        super();
        this.message = message;
        this.data = data;
    }
}

/**
 * The result of rotating a credential's secret
 */
export class RotateKeyResponse extends BasicResponseDTO {
    /**
     * The identity-provider client identifier whose secret was replaced
     */
    @ApiProperty({ required: false })
    public client_id?: string;

    /**
     * The freshly issued secret. Shown once.
     */
    @ApiProperty({ required: false })
    public client_secret?: string;

    /**
     * Convenience alias for the freshly issued secret
     */
    @ApiProperty({ required: false })
    public secret?: string;

    constructor({
        message,
        client_id,
        client_secret,
    }: {
        message: string;
        client_id?: string;
        client_secret?: string;
    }) {
        super();
        this.message = message;
        this.client_id = client_id;
        this.client_secret = client_secret;
        this.secret = client_secret;
    }
}
