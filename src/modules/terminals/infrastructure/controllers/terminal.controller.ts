import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { TerminalService } from '../../application/terminal.service';
import { CreateTerminalDto } from '../../dto/create-terminal.dto';
import { UpdateTerminalDto } from '../../dto/update-terminal.dto';
import type { TerminalFilters } from '../../domain/ports/terminal-repository.port';

@Controller('tenants/:tenantId/terminals')
@UseGuards(JwtAuthGuard)
export class TerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  @Post()
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTerminalDto,
    @Request() req: any,
  ) {
    return this.terminalService.createTerminal(tenantId, req.user.actorId, dto);
  }

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('capability') capability?: string,
  ) {
    const filters: TerminalFilters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (capability) filters.capability = capability;

    return this.terminalService.listTerminals(tenantId, filters);
  }

  @Get(':terminalId')
  async get(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
  ) {
    const terminal = await this.terminalService.getTerminal(tenantId, terminalId);
    if (!terminal) throw new NotFoundException();
    return terminal;
  }

  @Post(':terminalId/suspend')
  async suspend(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
  ) {
    return this.terminalService.suspendTerminal(tenantId, terminalId);
  }

  @Post(':terminalId/reactivate')
  async reactivate(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
  ) {
    return this.terminalService.reactivateTerminal(tenantId, terminalId);
  }

  @Post(':terminalId/rotate-credentials')
  async rotateCredentials(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
  ) {
    return this.terminalService.rotateCredentials(tenantId, terminalId);
  }

  @Post(':terminalId/revoke')
  async revoke(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
  ) {
    return this.terminalService.revokeTerminal(tenantId, terminalId);
  }

  @Patch(':terminalId')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
    @Body() dto: UpdateTerminalDto,
  ) {
    const terminal = await this.terminalService.updateTerminal(tenantId, terminalId, dto);
    if (!terminal) throw new NotFoundException();
    return terminal;
  }
}
