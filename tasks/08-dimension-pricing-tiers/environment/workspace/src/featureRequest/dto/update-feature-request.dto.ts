import { PartialType } from '@nestjs/swagger';
import { CreateFeatureRequestDto } from './createFeatureRequest.dto.js';

export class UpdateFeatureRequestDto extends PartialType(CreateFeatureRequestDto) {}
