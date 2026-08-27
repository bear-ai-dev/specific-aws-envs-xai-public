import { PartialType } from '@nestjs/swagger';
import { CreateAzureDto } from './create-azure.dto';

export class UpdateAzureDto extends PartialType(CreateAzureDto) {}
