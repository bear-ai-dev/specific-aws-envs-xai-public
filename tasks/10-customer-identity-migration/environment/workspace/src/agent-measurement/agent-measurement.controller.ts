import { Controller, Get, Post, Body, Patch, Param, Delete, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AgentMeasurementService } from './agent-measurement.service';
import { CreateAgentMeasurementDto } from './dto/create-agent-measurement.dto';
import { UpdateAgentMeasurementDto } from './dto/update-agent-measurement.dto';

@Controller('agent-measurement')
export class AgentMeasurementController {
    constructor(private readonly agentMeasurementService: AgentMeasurementService) {}

    @UseGuards(AuthGuard('jwt'))
    @Post()
    create(@Body() createAgentMeasurementDto) {
        return this.agentMeasurementService.create(createAgentMeasurementDto);
    }
}
