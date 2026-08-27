import { PartialType } from '@nestjs/swagger';
import { CreateFeatureRequestDto } from './createFeatureRequest.dto';

export class UpdateFeatureRequestDto extends PartialType(CreateFeatureRequestDto) {}
