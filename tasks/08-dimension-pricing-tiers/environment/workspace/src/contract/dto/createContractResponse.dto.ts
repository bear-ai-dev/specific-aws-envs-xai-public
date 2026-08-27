import { IntersectionType } from '@nestjs/swagger';
import { CreateContractDto } from './createContract.dto';
import { BasicResponseDTO } from '../../basicResponseDTO';
import { PrepareContractResponseDto } from './prepareContractResponse.dto';

export class CreateContractResponseDto extends IntersectionType(PrepareContractResponseDto, BasicResponseDTO) {
    constructor(fields: CreateContractResponseDto) {
        if (fields) {
            super(fields);
        }
    }
}
