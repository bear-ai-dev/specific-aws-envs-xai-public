import { PartialType } from '@nestjs/swagger';
import { CreateAgentMeasurementDto } from './create-agent-measurement.dto';

export class UpdateAgentMeasurementDto extends PartialType(CreateAgentMeasurementDto) {}
