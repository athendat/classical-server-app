import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';

import { TERMINAL_INJECTION_TOKENS, TERMINAL_SCOPE_TEMPLATES, TerminalStatus } from '../domain/constants/terminal.constants';
import type { ITerminalRepository, TerminalEntity, TerminalFilters } from '../domain/ports/terminal-repository.port';
import { OAuthService } from '../../oauth/application/oauth.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { ApiResponse } from 'src/common/types/api-response.type';
import type { CreateTerminalDto } from '../dto/create-terminal.dto';
import type { UpdateTerminalDto } from '../dto/update-terminal.dto';
import type { CreateTerminalResult, RotateCredentialsResult } from '../dto/terminal-response.dto';

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);

  constructor(
    @Inject(TERMINAL_INJECTION_TOKENS.TERMINAL_REPOSITORY)
    private readonly terminalRepository: ITerminalRepository,
    private readonly oauthService: OAuthService,
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
  ) {}

  async createTerminal(dto: CreateTerminalDto): Promise<ApiResponse<CreateTerminalResult>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    const tenantId = this.asyncContextService.getTenantId();

    if (!tenantId) {
      return ApiResponse.fail<CreateTerminalResult>(
        HttpStatus.BAD_REQUEST,
        'El token no contiene tenantId',
        'Missing tenantId in token',
      );
    }

    try {
      this.logger.log(`[${requestId}] Creating terminal: name=${dto.name}, type=${dto.type}`);

      // 1. Determine scopes: use custom scopes if provided, otherwise use template
      const scopes = dto.scopes?.length ? dto.scopes : TERMINAL_SCOPE_TEMPLATES[dto.type];

      // 2. Create OAuth client via oauthService
      const oauthResult = await this.oauthService.createClient(tenantId, dto.name, scopes);

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
        createdBy: actorId,
      });

      this.logger.log(`[${requestId}] Terminal created: ${terminal.terminalId}`);

      this.auditService.logAllow('CREATE_TERMINAL', 'terminal', terminal.terminalId, {
        module: 'terminals',
        severity: 'LOW',
        tags: ['terminal', 'create', 'successful'],
        actorId,
        changes: {
          after: { terminal: terminal.terminalId, type: dto.type },
        },
      });

      return ApiResponse.ok<CreateTerminalResult>(
        HttpStatus.CREATED,
        {
          terminal,
          credentials: {
            clientId: oauthResult.clientId,
            clientSecret: oauthResult.clientSecret,
          },
        },
        'Terminal creada exitosamente',
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to create terminal: ${errorMsg}`, error);

      this.auditService.logError(
        'CREATE_TERMINAL_FAILED',
        'terminal',
        'unknown',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'HIGH',
          tags: ['terminal', 'create', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<CreateTerminalResult>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al crear terminal',
      );
    }
  }

  async getTerminal(terminalId: string): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    const tenantId = this.asyncContextService.getTenantId();

    try {
      this.logger.log(`[${requestId}] Fetching terminal: ${terminalId}`);

      const terminal = await this.terminalRepository.findByTerminalId(terminalId);
      if (!terminal || terminal.tenantId !== tenantId) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, terminal, 'Terminal encontrada');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to fetch terminal: ${errorMsg}`, error);

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al obtener terminal',
      );
    }
  }

  async listTerminals(filters?: TerminalFilters): Promise<ApiResponse<TerminalEntity[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    const tenantId = this.asyncContextService.getTenantId()!;

    try {
      this.logger.log(`[${requestId}] Listing terminals for tenant=${tenantId}`);

      const terminals = await this.terminalRepository.findByTenantId(tenantId, filters);

      this.auditService.logAllow('LIST_TERMINALS', 'terminal', 'list', {
        module: 'terminals',
        severity: 'LOW',
        tags: ['terminal', 'read', 'list', 'successful'],
        actorId,
        changes: {
          after: { count: terminals.length },
        },
      });

      return ApiResponse.ok<TerminalEntity[]>(
        HttpStatus.OK,
        terminals,
        `${terminals.length} terminales encontradas`,
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to list terminals: ${errorMsg}`, error);

      this.auditService.logError(
        'LIST_TERMINALS_FAILED',
        'terminal',
        'list',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'MEDIUM',
          tags: ['terminal', 'read', 'list', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al listar terminales',
      );
    }
  }

  async updateTerminal(terminalId: string, dto: UpdateTerminalDto): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    const tenantId = this.asyncContextService.getTenantId()!;

    try {
      this.logger.log(`[${requestId}] Updating terminal: ${terminalId}`);

      const terminal = await this.resolveTerminal(tenantId, terminalId);
      if (!terminal) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      // Only allow updating: name, location, capabilities, device info
      const updateData: Partial<TerminalEntity> = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.location !== undefined) updateData.location = dto.location;
      if (dto.capabilities !== undefined) updateData.capabilities = dto.capabilities;
      if (dto.deviceSerial !== undefined) updateData.deviceSerial = dto.deviceSerial;
      if (dto.deviceModel !== undefined) updateData.deviceModel = dto.deviceModel;
      if (dto.deviceManufacturer !== undefined) updateData.deviceManufacturer = dto.deviceManufacturer;

      const updated = await this.terminalRepository.update(terminalId, updateData);

      this.auditService.logAllow('UPDATE_TERMINAL', 'terminal', terminalId, {
        module: 'terminals',
        severity: 'LOW',
        tags: ['terminal', 'update', 'successful'],
        actorId,
        changes: {
          before: { name: terminal.name },
          after: updateData,
        },
      });

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, updated!, 'Terminal actualizada');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to update terminal: ${errorMsg}`, error);

      this.auditService.logError(
        'UPDATE_TERMINAL_FAILED',
        'terminal',
        terminalId,
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'MEDIUM',
          tags: ['terminal', 'update', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al actualizar terminal',
      );
    }
  }

  async suspendTerminal(terminalId: string): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    const tenantId = this.asyncContextService.getTenantId()!;

    try {
      this.logger.log(`[${requestId}] Suspending terminal: ${terminalId}`);

      const terminal = await this.resolveTerminal(tenantId, terminalId);
      if (!terminal) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      if (terminal.status !== TerminalStatus.ACTIVE) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.CONFLICT,
          `No se puede suspender una terminal con estado '${terminal.status}'`,
          'Estado inválido para suspensión',
        );
      }

      await this.oauthService.deactivateClient(terminal.oauthClientId);
      const updated = await this.terminalRepository.update(terminalId, { status: TerminalStatus.SUSPENDED });

      this.auditService.logAllow('SUSPEND_TERMINAL', 'terminal', terminalId, {
        module: 'terminals',
        severity: 'MEDIUM',
        tags: ['terminal', 'suspend', 'successful'],
        actorId,
        changes: {
          before: { status: TerminalStatus.ACTIVE },
          after: { status: TerminalStatus.SUSPENDED },
        },
      });

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, updated!, 'Terminal suspendida');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to suspend terminal: ${errorMsg}`, error);

      this.auditService.logError(
        'SUSPEND_TERMINAL_FAILED',
        'terminal',
        terminalId,
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'HIGH',
          tags: ['terminal', 'suspend', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al suspender terminal',
      );
    }
  }

  async reactivateTerminal(terminalId: string): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    const tenantId = this.asyncContextService.getTenantId()!;

    try {
      this.logger.log(`[${requestId}] Reactivating terminal: ${terminalId}`);

      const terminal = await this.resolveTerminal(tenantId, terminalId);
      if (!terminal) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      if (terminal.status === TerminalStatus.REVOKED) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.CONFLICT,
          'No se puede reactivar una terminal revocada',
          'Terminal revocada',
        );
      }

      if (terminal.status !== TerminalStatus.SUSPENDED) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.CONFLICT,
          `La terminal ya está ${terminal.status}`,
          'Estado inválido para reactivación',
        );
      }

      await this.oauthService.reactivateClient(terminal.oauthClientId);
      const updated = await this.terminalRepository.update(terminalId, { status: TerminalStatus.ACTIVE });

      this.auditService.logAllow('REACTIVATE_TERMINAL', 'terminal', terminalId, {
        module: 'terminals',
        severity: 'MEDIUM',
        tags: ['terminal', 'reactivate', 'successful'],
        actorId,
        changes: {
          before: { status: TerminalStatus.SUSPENDED },
          after: { status: TerminalStatus.ACTIVE },
        },
      });

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, updated!, 'Terminal reactivada');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to reactivate terminal: ${errorMsg}`, error);

      this.auditService.logError(
        'REACTIVATE_TERMINAL_FAILED',
        'terminal',
        terminalId,
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'HIGH',
          tags: ['terminal', 'reactivate', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al reactivar terminal',
      );
    }
  }

  async revokeTerminal(terminalId: string): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    const tenantId = this.asyncContextService.getTenantId()!;

    try {
      this.logger.log(`[${requestId}] Revoking terminal: ${terminalId}`);

      const terminal = await this.resolveTerminal(tenantId, terminalId);
      if (!terminal) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      if (terminal.status === TerminalStatus.REVOKED) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.CONFLICT,
          'La terminal ya está revocada',
          'Terminal ya revocada',
        );
      }

      await this.oauthService.revokeClient(terminal.oauthClientId, tenantId);
      const updated = await this.terminalRepository.update(terminalId, {
        status: TerminalStatus.REVOKED,
        revokedAt: new Date(),
      });

      this.auditService.logAllow('REVOKE_TERMINAL', 'terminal', terminalId, {
        module: 'terminals',
        severity: 'HIGH',
        tags: ['terminal', 'revoke', 'successful'],
        actorId,
        changes: {
          before: { status: terminal.status },
          after: { status: TerminalStatus.REVOKED },
        },
      });

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, updated!, 'Terminal revocada');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to revoke terminal: ${errorMsg}`, error);

      this.auditService.logError(
        'REVOKE_TERMINAL_FAILED',
        'terminal',
        terminalId,
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'HIGH',
          tags: ['terminal', 'revoke', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al revocar terminal',
      );
    }
  }

  async rotateCredentials(terminalId: string): Promise<ApiResponse<RotateCredentialsResult>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;
    const tenantId = this.asyncContextService.getTenantId()!;

    try {
      this.logger.log(`[${requestId}] Rotating credentials for terminal: ${terminalId}`);

      const terminal = await this.resolveTerminal(tenantId, terminalId);
      if (!terminal) {
        return ApiResponse.fail<RotateCredentialsResult>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      if (terminal.status !== TerminalStatus.ACTIVE) {
        return ApiResponse.fail<RotateCredentialsResult>(
          HttpStatus.CONFLICT,
          'Solo se pueden rotar credenciales de terminales activas',
          'Estado inválido para rotación',
        );
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

      this.auditService.logAllow('ROTATE_TERMINAL_CREDENTIALS', 'terminal', terminalId, {
        module: 'terminals',
        severity: 'HIGH',
        tags: ['terminal', 'rotate-credentials', 'successful'],
        actorId,
      });

      return ApiResponse.ok<RotateCredentialsResult>(
        HttpStatus.OK,
        {
          clientId: newOauth.clientId,
          clientSecret: newOauth.clientSecret,
        },
        'Credenciales rotadas exitosamente',
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to rotate credentials: ${errorMsg}`, error);

      this.auditService.logError(
        'ROTATE_TERMINAL_CREDENTIALS_FAILED',
        'terminal',
        terminalId,
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'HIGH',
          tags: ['terminal', 'rotate-credentials', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<RotateCredentialsResult>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al rotar credenciales',
      );
    }
  }

  // ─── Admin methods (cross-tenant) ─────────────────────────────────

  async listAllTerminals(filters?: TerminalFilters & { tenantId?: string }): Promise<ApiResponse<TerminalEntity[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;

    try {
      this.logger.log(`[${requestId}] Admin listing all terminals`);

      let terminals: TerminalEntity[];
      if (filters?.tenantId) {
        terminals = await this.terminalRepository.findByTenantId(filters.tenantId, filters);
      } else {
        terminals = await this.terminalRepository.findAll(filters);
      }

      this.auditService.logAllow('ADMIN_LIST_TERMINALS', 'terminal', 'list', {
        module: 'terminals',
        severity: 'LOW',
        tags: ['terminal', 'admin', 'read', 'list', 'successful'],
        actorId,
        changes: {
          after: { count: terminals.length },
        },
      });

      return ApiResponse.ok<TerminalEntity[]>(
        HttpStatus.OK,
        terminals,
        `${terminals.length} terminales encontradas`,
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to list all terminals: ${errorMsg}`, error);

      this.auditService.logError(
        'ADMIN_LIST_TERMINALS_FAILED',
        'terminal',
        'list',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'MEDIUM',
          tags: ['terminal', 'admin', 'read', 'list', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al listar terminales',
      );
    }
  }

  async getTerminalById(terminalId: string): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();

    try {
      this.logger.log(`[${requestId}] Admin fetching terminal: ${terminalId}`);

      const terminal = await this.terminalRepository.findByTerminalId(terminalId);
      if (!terminal) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, terminal, 'Terminal encontrada');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to fetch terminal: ${errorMsg}`, error);

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al obtener terminal',
      );
    }
  }

  async adminSuspendTerminal(terminalId: string): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;

    try {
      this.logger.log(`[${requestId}] Admin suspending terminal: ${terminalId}`);

      const terminal = await this.terminalRepository.findByTerminalId(terminalId);
      if (!terminal) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      if (terminal.status !== TerminalStatus.ACTIVE) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.CONFLICT,
          `No se puede suspender una terminal con estado '${terminal.status}'`,
          'Estado inválido para suspensión',
        );
      }

      await this.oauthService.deactivateClient(terminal.oauthClientId);
      const updated = await this.terminalRepository.update(terminalId, { status: TerminalStatus.SUSPENDED });

      this.auditService.logAllow('ADMIN_SUSPEND_TERMINAL', 'terminal', terminalId, {
        module: 'terminals',
        severity: 'HIGH',
        tags: ['terminal', 'admin', 'suspend', 'successful'],
        actorId,
        changes: {
          before: { status: TerminalStatus.ACTIVE },
          after: { status: TerminalStatus.SUSPENDED },
        },
      });

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, updated!, 'Terminal suspendida por admin');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to admin suspend terminal: ${errorMsg}`, error);

      this.auditService.logError(
        'ADMIN_SUSPEND_TERMINAL_FAILED',
        'terminal',
        terminalId,
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'HIGH',
          tags: ['terminal', 'admin', 'suspend', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al suspender terminal',
      );
    }
  }

  async adminRevokeTerminal(terminalId: string): Promise<ApiResponse<TerminalEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    const actorId = this.asyncContextService.getActorId()!;

    try {
      this.logger.log(`[${requestId}] Admin revoking terminal: ${terminalId}`);

      const terminal = await this.terminalRepository.findByTerminalId(terminalId);
      if (!terminal) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.NOT_FOUND,
          'Terminal no encontrada',
          'Terminal not found',
        );
      }

      if (terminal.status === TerminalStatus.REVOKED) {
        return ApiResponse.fail<TerminalEntity>(
          HttpStatus.CONFLICT,
          'La terminal ya está revocada',
          'Terminal ya revocada',
        );
      }

      await this.oauthService.revokeClient(terminal.oauthClientId, terminal.tenantId);
      const updated = await this.terminalRepository.update(terminalId, {
        status: TerminalStatus.REVOKED,
        revokedAt: new Date(),
      });

      this.auditService.logAllow('ADMIN_REVOKE_TERMINAL', 'terminal', terminalId, {
        module: 'terminals',
        severity: 'HIGH',
        tags: ['terminal', 'admin', 'revoke', 'successful'],
        actorId,
        changes: {
          before: { status: terminal.status },
          after: { status: TerminalStatus.REVOKED },
        },
      });

      return ApiResponse.ok<TerminalEntity>(HttpStatus.OK, updated!, 'Terminal revocada por admin');
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to admin revoke terminal: ${errorMsg}`, error);

      this.auditService.logError(
        'ADMIN_REVOKE_TERMINAL_FAILED',
        'terminal',
        terminalId,
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'terminals',
          severity: 'HIGH',
          tags: ['terminal', 'admin', 'revoke', 'error'],
          actorId,
        },
      );

      return ApiResponse.fail<TerminalEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error al revocar terminal',
      );
    }
  }

  async findByOAuthClientId(clientId: string): Promise<TerminalEntity | null> {
    return this.terminalRepository.findByOAuthClientId(clientId);
  }

  // ─── Private helpers ─────────────────────────────────────────────────

  private async resolveTerminal(tenantId: string, terminalId: string): Promise<TerminalEntity | null> {
    const terminal = await this.terminalRepository.findByTerminalId(terminalId);
    if (terminal && terminal.tenantId !== tenantId) return null;
    return terminal;
  }
}
