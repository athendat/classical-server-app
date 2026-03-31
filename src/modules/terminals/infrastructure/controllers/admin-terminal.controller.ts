import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Permissions } from 'src/modules/auth/decorators/permissions.decorator';
import { TerminalService } from '../../application/terminal.service';
import { AdminTerminalFiltersDto } from '../../dto/admin-terminal-filters.dto';

@Controller('admin/terminals')
@UseGuards(JwtAuthGuard)
export class AdminTerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  @Get()
  @Permissions('terminals.admin.read')
  async listAll(@Query() filters: AdminTerminalFiltersDto) {
    return this.terminalService.listAllTerminals(filters);
  }

  @Get(':terminalId')
  @Permissions('terminals.admin.read')
  async get(@Param('terminalId') terminalId: string) {
    const terminal = await this.terminalService.getTerminalById(terminalId);
    if (!terminal) throw new NotFoundException();
    return terminal;
  }

  @Post(':terminalId/suspend')
  @Permissions('terminals.admin.suspend')
  async suspend(@Param('terminalId') terminalId: string) {
    return this.terminalService.adminSuspendTerminal(terminalId);
  }

  @Post(':terminalId/revoke')
  @Permissions('terminals.admin.revoke')
  async revoke(@Param('terminalId') terminalId: string) {
    return this.terminalService.adminRevokeTerminal(terminalId);
  }
}
