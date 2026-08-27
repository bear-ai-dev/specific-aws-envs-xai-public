import { BasicResponseDTO } from '../../basicResponseDTO';
import { UserEntity } from '../entities/user.entity';

export class ReadUserDTO {
    subject: string;
}
export class ReadResponseDTO extends BasicResponseDTO {
    public data: Array<UserEntity>;
}
