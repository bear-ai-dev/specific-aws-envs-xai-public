import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Environment } from './Environment.js';

export class UpdateEnvironmentDto {
    /**
     * The environment to use for the user
     * <br><br>
     * Example `"sandbox"`
     * @example "sandbox"
     */
    @ApiProperty({ enum: Environment, example: Environment.SANDBOX })
    @IsEnum(Environment)
    @IsOptional()
    public environment?: Environment;

    /**
     * The subject to use for the user
     * <br><br>
     * Example `"auth0|5f9a7a7a7a7a7a7a7a7a7a7a"`
     * @example "auth0|5f9a7a7a7a7a7a7a7a7a7a7a"
     */
    @IsString()
    @IsOptional()
    public userSubject?: string;
}
