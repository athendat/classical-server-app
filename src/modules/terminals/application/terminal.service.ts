import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';

import { TERMINAL_INJECTION_TOKENS, TERMINAL_SCOPE_TEMPLATES, TerminalStatus } from '../domain/constants/terminal.constants';
import type { ITerminalRepository, TerminalEntity, TerminalFilters } from '../domain/ports/terminal-repository.port';
import { OAuthService } from '../../oauth/application/oauth.service';
import type { CreateTerminalDto } from '../dto/create-terminal.dto';
import type { UpdateTerminalDto } from '../dto/update-terminal.dto';
import type { CreateTerminalResult, RotateCredentialsResult } from '../dto/terminal-response.dto';

@Injectable()
export class TerminalService {
  constructor(
    @Inject(TERMINAL_INJECTION_TOKENS.TERMINAL_REPOSITORY)
    private readonly terminalRepository: ITerminalRepository,
    private readonly oauthService: OAuthService,
  ) {}

  async createTerminal(tenantId: string, createdBy: string, dto: CreateTerminalDto): Promise<CreateTerminalResult> {
    // 1. Determine scopes: use custom scopes if provided, otherwise use template
    const scopes = dto.scopes?.length ? dto.scopes : TERMINAL_SCOPE_TEMPLATES[dto.type];

    // 2. Create OAuth client via oauthService
    const oauthResult = await this.oauthService.createClient(tenantId, dto.name, scopes);

    try {
      // 3. Create terminal record
      const terminal = await this.terminalRepository.create({
        tenantId,
        name: dto.name,
        type: dto.type,
        capabilities: dto.capabilities,
        status: TerminalStatus.ACTIVE,
        location: dto.location,
        deviceSerial: dto.deviceSerial,
        deviceModel: dto.deviceModel,
        deviceManufacturer: dto.deviceManufacturer,
        oauthClientId: oauthResult.clientId,
        createdBy,
      });

      // 4. Return terminal + credentials (secret shown once)
      return {
        terminal,
        credentials: {
          clientId: oauthResult.clientId,
          clientSecret: oauthResult.clientSecret,
        },
      };
    } catch (error) {
      // Compensating action: clean up OAuth client if terminal creation fails
      try {
        await this.oauthService.revokeClient(oauthResult.clientId, tenantId);
      } catch {
        // Intentionally ignore cleanup errors to preserve original failure
      }
      throw error;
    }
  }

  async getTerminal(tenantId: string, terminalId: string): Promise<TerminalEntity | null> {
    const terminal = await this.terminalRepository.findByTerminalId(terminalId);
    if (terminal && terminal.tenantId !== tenantId) return null; // Ownership check
    return terminal;
  }

  async listTerminals(tenantId: string, filters?: TerminalFilters): Promise<TerminalEntity[]> {
    return this.terminalRepository.findByTenantId(tenantId, filters);
  }

  async updateTerminal(tenantId: string, terminalId: string, dto: UpdateTerminalDto): Promise<TerminalEntity | null> {
    const terminal = await this.getTerminal(tenantId, terminalId);
    if (!terminal) return null;

    // Only allow updating: name, location, capabilities, device info
    const updateData: Partial<TerminalEntity> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.capabilities !== undefined) updateData.capabilities = dto.capabilities;
    if (dto.deviceSerial !== undefined) updateData.deviceSerial = dto.deviceSerial;
    if (dto.deviceModel !== undefined) updateData.deviceModel = dto.deviceModel;
    if (dto.deviceManufacturer !== undefined) updateData.deviceManufacturer = dto.deviceManufacturer;

    return this.terminalRepository.update(terminalId, updateData);
  }

  async suspendTerminal(tenantId: string, terminalId: string): Promise<TerminalEntity> {
    const terminal = await this.getTerminal(tenantId, terminalId);
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (terminal.status !== TerminalStatus.ACTIVE) {
      throw new BadRequestException(`Cannot suspend terminal with status '${terminal.status}'`);
    }

    await this.oauthService.deactivateClient(terminal.oauthClientId);

    return this.terminalRepository.update(terminalId, { status: TerminalStatus.SUSPENDED });
  }

  async reactivateTerminal(tenantId: string, terminalId: string): Promise<TerminalEntity> {
    const terminal = await this.getTerminal(tenantId, terminalId);
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (terminal.status === TerminalStatus.REVOKED) {
      throw new BadRequestException('Cannot reactivate a revoked terminal');
    }
    if (terminal.status !== TerminalStatus.SUSPENDED) {
      throw new BadRequestException(`Terminal is already ${terminal.status}`);
    }

    await this.oauthService.reactivateClient(terminal.oauthClientId);

    return this.terminalRepository.update(terminalId, { status: TerminalStatus.ACTIVE });
  }

  async revokeTerminal(tenantId: string, terminalId: string): Promise<TerminalEntity> {
    const terminal = await this.getTerminal(tenantId, terminalId);
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (terminal.status === TerminalStatus.REVOKED) {
      throw new BadRequestException('Terminal is already revoked');
    }

    await this.oauthService.revokeClient(terminal.oauthClientId, tenantId);

    return this.terminalRepository.update(terminalId, {
      status: TerminalStatus.REVOKED,
      revokedAt: new Date(),
    });
  }

  async rotateCredentials(tenantId: string, terminalId: string): Promise<RotateCredentialsResult> {
    const terminal = await this.getTerminal(tenantId, terminalId);
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (terminal.status !== TerminalStatus.ACTIVE) {
      throw new BadRequestException('Can only rotate credentials for active terminals');
    }

    // 1. Get old client's scopes (to carry over)
    const oldClients = await this.oauthService.listClients(tenantId);
    const oldClient = oldClients.find(c => c.clientId === terminal.oauthClientId);
    const scopes = oldClient?.scopes || [];

    // 2. Revoke old OAuth client
    await this.oauthService.revokeClient(terminal.oauthClientId, tenantId);

    // 3. Create new OAuth client with same scopes
    const newOauth = await this.oauthService.createClient(tenantId, terminal.name, scopes);

    // 4. Update terminal's oauthClientId
    await this.terminalRepository.update(terminalId, { oauthClientId: newOauth.clientId });

    return {
      clientId: newOauth.clientId,
      clientSecret: newOauth.clientSecret,
    };
  }

  // ─── Admin methods (cross-tenant) ─────────────────────────────────

  async listAllTerminals(filters?: TerminalFilters & { tenantId?: string }): Promise<TerminalEntity[]> {
    if (filters?.tenantId) {
      return this.terminalRepository.findByTenantId(filters.tenantId, filters);
    }
    return this.terminalRepository.findAll(filters);
  }

  async getTerminalById(terminalId: string): Promise<TerminalEntity | null> {
    return this.terminalRepository.findByTerminalId(terminalId);
  }

  async adminSuspendTerminal(terminalId: string): Promise<TerminalEntity> {
    const terminal = await this.terminalRepository.findByTerminalId(terminalId);
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (terminal.status !== TerminalStatus.ACTIVE) {
      throw new BadRequestException(`Cannot suspend terminal with status '${terminal.status}'`);
    }
    await this.oauthService.deactivateClient(terminal.oauthClientId);
    return this.terminalRepository.update(terminalId, { status: TerminalStatus.SUSPENDED });
  }

  async adminRevokeTerminal(terminalId: string): Promise<TerminalEntity> {
    const terminal = await this.terminalRepository.findByTerminalId(terminalId);
    if (!terminal) throw new NotFoundException('Terminal not found');
    if (terminal.status === TerminalStatus.REVOKED) {
      throw new BadRequestException('Terminal is already revoked');
    }
    await this.oauthService.revokeClient(terminal.oauthClientId, terminal.tenantId);
    return this.terminalRepository.update(terminalId, { status: TerminalStatus.REVOKED, revokedAt: new Date() });
  }

  async findByOAuthClientId(clientId: string): Promise<TerminalEntity | null> {
    return this.terminalRepository.findByOAuthClientId(clientId);
  }
}
