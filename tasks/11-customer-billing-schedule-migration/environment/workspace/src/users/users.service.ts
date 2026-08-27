import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { InfluxService } from '../influx/influx.service';
import { UserEntity } from './entities/user.entity';
import { ReadResponseDTO, ReadUserDTO } from './dto/read-user.dto';
import { BasicResponseDTO } from '../basicResponseDTO';
import { JwtDto } from './dto/jwt.dto';

@Injectable()
export class UsersService {
    constructor(readonly InfluxService: InfluxService) {}
    async create(createUserDto: CreateUserDto): Promise<BasicResponseDTO> {
        const { subject, businessID, temp, accountExpiryDate, stripeAccountID } = createUserDto;
        const { loadPoints } = this.InfluxService;
        // Take in subject and business ID
        const userEntity = new UserEntity({ subject, businessID, temp, accountExpiryDate });
        // Commit to TSDB
        const pointsArray = UserEntity.transformer(userEntity, this.InfluxService);
        await loadPoints(`${process.env.STAGE}-config`, `meteringco`, pointsArray);
        // Return message
        return { message: 'sucessfully uploaded user config' };
    }

    findAll() {
        return `This action returns all users`;
    }

    async findOne(readUserDTO: ReadUserDTO): Promise<ReadResponseDTO> {
        // Given a subject
        const { subject } = readUserDTO;
        // Query TSDB for latest row
        const { readUserData } = this.InfluxService;
        const results = await readUserData(subject);
        if (results.length === 0) {
            throw new ConflictException(
                'User was not found, User must be onboarded to env first before using the API, contact an admin'
            );
        }
        // Return Subject and tag info
        const userEntity = UserEntity.dbModelToEntity(results);
        if (userEntity.businessID) {
            return { message: 'Found user', data: [userEntity] };
        } else {
            throw new NotFoundException(`Business ID was not found for subject: ${subject}`);
        }
    }

    remove(id: number) {
        return `This action removes a #${id} user`;
    }
}
