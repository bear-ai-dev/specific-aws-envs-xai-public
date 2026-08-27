import { ApiProperty } from '@nestjs/swagger';
import { BasicResponseDTO } from '../../basicResponseDTO.js';

export class KeyDto {
    /**
     * The identity-provider client id for this machine credential
     * @example keyHarborlineProdIngest
     */
    @ApiProperty()
    public client_id: string;

    /**
     * Display name of the credential
     * @example Harborline production ingest
     */
    @ApiProperty()
    public name?: string;

    /**
     * Application type as recorded by the identity provider
     * @example non_interactive
     */
    @ApiProperty()
    public app_type?: string;

    /**
     * Subject the credential signs in as
     * @example keyHarborlineProdIngest@clients
     */
    @ApiProperty()
    public subject?: string;

    /**
     * Fresh secret, only present immediately after rotation
     */
    @ApiProperty({ required: false })
    public client_secret?: string;
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

    @ApiProperty({ required: false })
    public name?: string;
}
