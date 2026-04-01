import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentActor } from 'src/modules/auth/decorators/current-actor.decorator';
import type { Actor } from 'src/common/interfaces/actor.interface';
import { TerminalService } from '../../application/terminal.service';
import { CreateTerminalDto } from '../../dto/create-terminal.dto';
import { UpdateTerminalDto } from '../../dto/update-terminal.dto';
import type { TerminalFilters } from '../../domain/ports/terminal-repository.port';

@Controller('tenants/:tenantId/terminals')
@UseGuards(JwtAuthGuard)
export class TerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  private assertTenantOwnership(actor: Actor, tenantId: string): void {
    if (!actor.tenantId || actor.tenantId !== tenantId) {
      throw new ForbiddenException('Access to this tenant is not allowed');
    }
  }

  @Post()
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTerminalDto,
    @CurrentActor() actor: Actor,
  ) {
    this.assertTenantOwnership(actor, tenantId);
    return this.terminalService.createTerminal(tenantId, actor.actorId, dto);
  }

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @CurrentActor() actor: Actor,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('capability') capability?: string,
  ) {
    this.assertTenantOwnership(actor, tenantId);
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
    @CurrentActor() actor: Actor,
  ) {
    this.assertTenantOwnership(actor, tenantId);
    const terminal = await this.terminalService.getTerminal(tenantId, terminalId);
    if (!terminal) throw new NotFoundException();
    return terminal;
  }

  @Post(':terminalId/suspend')
  async suspend(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
    @CurrentActor() actor: Actor,
  ) {
    this.assertTenantOwnership(actor, tenantId);
    return this.terminalService.suspendTerminal(tenantId, terminalId);
  }

  @Post(':terminalId/reactivate')
  async reactivate(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
    @CurrentActor() actor: Actor,
  ) {
    this.assertTenantOwnership(actor, tenantId);
    return this.terminalService.reactivateTerminal(tenantId, terminalId);
  }

  @Post(':terminalId/rotate-credentials')
  async rotateCredentials(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
    @CurrentActor() actor: Actor,
  ) {
    this.assertTenantOwnership(actor, tenantId);
    return this.terminalService.rotateCredentials(tenantId, terminalId);
  }

  @Post(':terminalId/revoke')
  async revoke(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
    @CurrentActor() actor: Actor,
  ) {
    this.assertTenantOwnership(actor, tenantId);
    return this.terminalService.revokeTerminal(tenantId, terminalId);
  }

  @Patch(':terminalId')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('terminalId') terminalId: string,
    @Body() dto: UpdateTerminalDto,
    @CurrentActor() actor: Actor,
  ) {
    this.assertTenantOwnership(actor, tenantId);
    const terminal = await this.terminalService.updateTerminal(tenantId, terminalId, dto);
    if (!terminal) throw new NotFoundException();
    return terminal;
  }
}
