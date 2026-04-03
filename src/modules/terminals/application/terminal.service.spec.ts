import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid'),
}));

import { TerminalService } from './terminal.service';
import { TERMINAL_INJECTION_TOKENS, TerminalType, TerminalCapability, TerminalStatus, TERMINAL_SCOPE_TEMPLATES } from '../domain/constants/terminal.constants';
import type { ITerminalRepository, TerminalEntity, TerminalFilters } from '../domain/ports/terminal-repository.port';
import { OAuthService } from '../../oauth/application/oauth.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import type { CreateTerminalDto } from '../dto/create-terminal.dto';
import type { UpdateTerminalDto } from '../dto/update-terminal.dto';

describe('TerminalService', () => {
  let service: TerminalService;
  let repository: jest.Mocked<ITerminalRepository>;
  let oauthService: jest.Mocked<Pick<OAuthService, 'createClient' | 'deactivateClient' | 'reactivateClient' | 'revokeClient' | 'listClients'>>;
  let asyncContextService: jest.Mocked<Pick<AsyncContextService, 'getRequestId' | 'getActorId' | 'getTenantId'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'logAllow' | 'logError'>>;

  const mockTerminal: TerminalEntity = {
    id: 'mongo-id',
    terminalId: 'term-uuid-1',
    tenantId: 'tenant-123',
    name: 'POS Counter 1',
    type: TerminalType.PHYSICAL_POS,
    capabilities: [TerminalCapability.NFC, TerminalCapability.CHIP],
    status: TerminalStatus.ACTIVE,
    oauthClientId: 'oauth-client-uuid',
    createdBy: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository: jest.Mocked<ITerminalRepository> = {
      create: jest.fn().mockResolvedValue(mockTerminal),
      findByTerminalId: jest.fn().mockResolvedValue(null),
      findByTenantId: jest.fn().mockResolvedValue([]),
      findByOAuthClientId: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(null),
    };

    const mockOAuthService: typeof oauthService = {
      createClient: jest.fn().mockResolvedValue({
        clientId: 'oauth-client-uuid',
        clientSecret: 'secret-hex-value',
      }),
      deactivateClient: jest.fn().mockResolvedValue(undefined),
      reactivateClient: jest.fn().mockResolvedValue(undefined),
      revokeClient: jest.fn().mockResolvedValue(undefined),
      listClients: jest.fn().mockResolvedValue([]),
    };

    const mockAsyncContextService: typeof asyncContextService = {
      getRequestId: jest.fn().mockReturnValue('req-123'),
      getActorId: jest.fn().mockReturnValue('user-123'),
      getTenantId: jest.fn().mockReturnValue('tenant-123'),
    };

    const mockAuditService: typeof auditService = {
      logAllow: jest.fn(),
      logError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TerminalService,
        {
          provide: TERMINAL_INJECTION_TOKENS.TERMINAL_REPOSITORY,
          useValue: mockRepository,
        },
        {
          provide: OAuthService,
          useValue: mockOAuthService,
        },
        {
          provide: AsyncContextService,
          useValue: mockAsyncContextService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<TerminalService>(TerminalService);
    repository = module.get(TERMINAL_INJECTION_TOKENS.TERMINAL_REPOSITORY);
    oauthService = module.get(OAuthService);
    asyncContextService = module.get(AsyncContextService);
    auditService = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── createTerminal ──────────────────────────────────────────────────

  describe('createTerminal', () => {
    it('should return ApiResponse.ok with terminal and credentials', async () => {
      const dto: CreateTerminalDto = {
        name: 'POS Counter 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC, TerminalCapability.CHIP],
      };

      const result = await service.createTerminal(dto);

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.data).toEqual({
        terminal: mockTerminal,
        credentials: {
          clientId: 'oauth-client-uuid',
          clientSecret: 'secret-hex-value',
        },
      });
    });

    it('should get tenantId from AsyncContextService', async () => {
      const dto: CreateTerminalDto = {
        name: 'POS Counter 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC, TerminalCapability.CHIP],
      };

      await service.createTerminal(dto);

      expect(asyncContextService.getTenantId).toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
        }),
      );
    });

    it('should use actorId from AsyncContextService as createdBy', async () => {
      const dto: CreateTerminalDto = {
        name: 'POS Counter 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC, TerminalCapability.CHIP],
      };

      await service.createTerminal(dto);

      expect(asyncContextService.getActorId).toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'user-123',
        }),
      );
    });

    it('should create OAuth client with template scopes for physical_pos', async () => {
      const dto: CreateTerminalDto = {
        name: 'POS 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC],
      };

      await service.createTerminal(dto);

      expect(oauthService.createClient).toHaveBeenCalledWith(
        'tenant-123',
        'POS 1',
        TERMINAL_SCOPE_TEMPLATES[TerminalType.PHYSICAL_POS],
      );
    });

    it('should use web scope template', async () => {
      const dto: CreateTerminalDto = {
        name: 'Web Terminal',
        type: TerminalType.WEB,
        capabilities: [TerminalCapability.MANUAL_ENTRY],
      };

      await service.createTerminal(dto);

      expect(oauthService.createClient).toHaveBeenCalledWith(
        'tenant-123',
        'Web Terminal',
        ['payments:authorize', 'transactions:read'],
      );
    });

    it('should use kiosk scope template', async () => {
      const dto: CreateTerminalDto = {
        name: 'Kiosk 1',
        type: TerminalType.KIOSK,
        capabilities: [TerminalCapability.QR_DISPLAY],
      };

      await service.createTerminal(dto);

      expect(oauthService.createClient).toHaveBeenCalledWith(
        'tenant-123',
        'Kiosk 1',
        ['payments:authorize'],
      );
    });

    it('should use custom scopes when provided (override template)', async () => {
      const dto: CreateTerminalDto = {
        name: 'Custom POS',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC],
        scopes: ['payments:authorize'],
      };

      await service.createTerminal(dto);

      expect(oauthService.createClient).toHaveBeenCalledWith(
        'tenant-123',
        'Custom POS',
        ['payments:authorize'],
      );
    });

    it('should log audit on successful creation', async () => {
      const dto: CreateTerminalDto = {
        name: 'POS Counter 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC],
      };

      await service.createTerminal(dto);

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'CREATE_TERMINAL',
        'terminal',
        expect.any(String),
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
        }),
      );
    });

    it('should return ApiResponse.fail and log audit on error', async () => {
      oauthService.createClient.mockRejectedValueOnce(new Error('OAuth failed'));

      const dto: CreateTerminalDto = {
        name: 'POS Counter 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC],
      };

      const result = await service.createTerminal(dto);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalledWith(
        'CREATE_TERMINAL_FAILED',
        'terminal',
        expect.any(String),
        expect.any(Error),
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
        }),
      );
    });

    it('should return ApiResponse.fail BAD_REQUEST when tenantId is not in token', async () => {
      asyncContextService.getTenantId.mockReturnValueOnce(undefined as any);

      const dto: CreateTerminalDto = {
        name: 'POS Counter 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC],
      };

      const result = await service.createTerminal(dto);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  // ─── getTerminal ─────────────────────────────────────────────────────

  describe('getTerminal', () => {
    it('should return ApiResponse.ok with terminal when found', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);

      const result = await service.getTerminal('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(mockTerminal);
    });

    it('should return ApiResponse.fail NOT_FOUND when terminal does not exist', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(null);

      const result = await service.getTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('should return ApiResponse.fail NOT_FOUND when tenantId does not match (ownership check)', async () => {
      asyncContextService.getTenantId.mockReturnValueOnce('tenant-B');
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        tenantId: 'tenant-A',
      });

      const result = await service.getTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });

  // ─── listTerminals ───────────────────────────────────────────────────

  describe('listTerminals', () => {
    it('should return ApiResponse.ok with terminal list', async () => {
      const terminals = [mockTerminal, { ...mockTerminal, terminalId: 'term-uuid-2' }];
      repository.findByTenantId.mockResolvedValueOnce(terminals);

      const filters: TerminalFilters = { type: 'web', status: 'active' };
      const result = await service.listTerminals(filters);

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(terminals);
      expect(repository.findByTenantId).toHaveBeenCalledWith('tenant-123', filters);
    });

    it('should log audit on successful list', async () => {
      repository.findByTenantId.mockResolvedValueOnce([mockTerminal]);

      await service.listTerminals();

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'LIST_TERMINALS',
        'terminal',
        'list',
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
        }),
      );
    });
  });

  // ─── updateTerminal ──────────────────────────────────────────────────

  describe('updateTerminal', () => {
    it('should return ApiResponse.ok with updated terminal', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      const updatedTerminal = { ...mockTerminal, name: 'New Name' };
      repository.update.mockResolvedValueOnce(updatedTerminal);

      const dto: UpdateTerminalDto = {
        name: 'New Name',
        location: { label: 'Lobby', address: '123 Main St' },
      };

      const result = await service.updateTerminal('term-uuid-1', dto);

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(updatedTerminal);
      expect(repository.update).toHaveBeenCalledWith('term-uuid-1', {
        name: 'New Name',
        location: { label: 'Lobby', address: '123 Main St' },
      });
    });

    it('should return ApiResponse.fail NOT_FOUND for non-existent terminal', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(null);

      const result = await service.updateTerminal('non-existent', { name: 'X' });

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should log audit on successful update', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      repository.update.mockResolvedValueOnce({ ...mockTerminal, name: 'New Name' });

      await service.updateTerminal('term-uuid-1', { name: 'New Name' });

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'UPDATE_TERMINAL',
        'terminal',
        'term-uuid-1',
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
        }),
      );
    });
  });

  // ─── suspendTerminal ─────────────────────────────────────────────────

  describe('suspendTerminal', () => {
    it('should return ApiResponse.ok with suspended terminal and deactivate OAuth', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      const suspendedTerminal = { ...mockTerminal, status: TerminalStatus.SUSPENDED };
      repository.update.mockResolvedValueOnce(suspendedTerminal);

      const result = await service.suspendTerminal('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data!.status).toBe(TerminalStatus.SUSPENDED);
      expect(oauthService.deactivateClient).toHaveBeenCalledWith('oauth-client-uuid');
      expect(repository.update).toHaveBeenCalledWith('term-uuid-1', { status: TerminalStatus.SUSPENDED });
    });

    it('should return ApiResponse.fail CONFLICT if terminal is not active', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.SUSPENDED,
      });

      const result = await service.suspendTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('should return ApiResponse.fail NOT_FOUND if terminal not found', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(null);

      const result = await service.suspendTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('should log audit on successful suspend', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      repository.update.mockResolvedValueOnce({ ...mockTerminal, status: TerminalStatus.SUSPENDED });

      await service.suspendTerminal('term-uuid-1');

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'SUSPEND_TERMINAL',
        'terminal',
        'term-uuid-1',
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
          changes: expect.objectContaining({
            before: { status: TerminalStatus.ACTIVE },
            after: { status: TerminalStatus.SUSPENDED },
          }),
        }),
      );
    });
  });

  // ─── reactivateTerminal ──────────────────────────────────────────────

  describe('reactivateTerminal', () => {
    it('should return ApiResponse.ok with reactivated terminal and reactivate OAuth', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.SUSPENDED,
      });
      const reactivatedTerminal = { ...mockTerminal, status: TerminalStatus.ACTIVE };
      repository.update.mockResolvedValueOnce(reactivatedTerminal);

      const result = await service.reactivateTerminal('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data!.status).toBe(TerminalStatus.ACTIVE);
      expect(oauthService.reactivateClient).toHaveBeenCalledWith('oauth-client-uuid');
      expect(repository.update).toHaveBeenCalledWith('term-uuid-1', { status: TerminalStatus.ACTIVE });
    });

    it('should return ApiResponse.fail CONFLICT if terminal is revoked', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.REVOKED,
        revokedAt: new Date(),
      });

      const result = await service.reactivateTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('should return ApiResponse.fail CONFLICT if terminal is already active', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);

      const result = await service.reactivateTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('should log audit on successful reactivation', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.SUSPENDED,
      });
      repository.update.mockResolvedValueOnce({ ...mockTerminal, status: TerminalStatus.ACTIVE });

      await service.reactivateTerminal('term-uuid-1');

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'REACTIVATE_TERMINAL',
        'terminal',
        'term-uuid-1',
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
          changes: expect.objectContaining({
            before: { status: TerminalStatus.SUSPENDED },
            after: { status: TerminalStatus.ACTIVE },
          }),
        }),
      );
    });
  });

  // ─── revokeTerminal ──────────────────────────────────────────────────

  describe('revokeTerminal', () => {
    it('should return ApiResponse.ok with revoked terminal and revoke OAuth', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      const revokedTerminal = { ...mockTerminal, status: TerminalStatus.REVOKED, revokedAt: new Date() };
      repository.update.mockResolvedValueOnce(revokedTerminal);

      const result = await service.revokeTerminal('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data!.status).toBe(TerminalStatus.REVOKED);
      expect(oauthService.revokeClient).toHaveBeenCalledWith('oauth-client-uuid', 'tenant-123');
      expect(repository.update).toHaveBeenCalledWith('term-uuid-1', {
        status: TerminalStatus.REVOKED,
        revokedAt: expect.any(Date),
      });
    });

    it('should return ApiResponse.fail CONFLICT if terminal is already revoked', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.REVOKED,
        revokedAt: new Date(),
      });

      const result = await service.revokeTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('should log audit on successful revoke', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      repository.update.mockResolvedValueOnce({ ...mockTerminal, status: TerminalStatus.REVOKED, revokedAt: new Date() });

      await service.revokeTerminal('term-uuid-1');

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'REVOKE_TERMINAL',
        'terminal',
        'term-uuid-1',
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
          changes: expect.objectContaining({
            before: { status: TerminalStatus.ACTIVE },
            after: { status: TerminalStatus.REVOKED },
          }),
        }),
      );
    });
  });

  // ─── rotateCredentials ───────────────────────────────────────────────

  describe('rotateCredentials', () => {
    it('should return ApiResponse.ok with new credentials', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        oauthClientId: 'old-id',
      });
      oauthService.listClients.mockResolvedValueOnce([
        { clientId: 'old-id', scopes: ['payments:authorize', 'transactions:read'], merchantId: 'tenant-123', terminalName: 'POS Counter 1', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ] as any);
      oauthService.revokeClient.mockResolvedValueOnce(undefined);
      oauthService.createClient.mockResolvedValueOnce({ clientId: 'new-id', clientSecret: 'new-secret' });
      repository.update.mockResolvedValueOnce({ ...mockTerminal, oauthClientId: 'new-id' });

      const result = await service.rotateCredentials('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual({ clientId: 'new-id', clientSecret: 'new-secret' });
    });

    it('should carry over scopes from old client to new', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        oauthClientId: 'old-id',
      });
      oauthService.listClients.mockResolvedValueOnce([
        { clientId: 'old-id', scopes: ['payments:authorize', 'payments:refund'], merchantId: 'tenant-123', terminalName: 'POS Counter 1', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ] as any);
      oauthService.revokeClient.mockResolvedValueOnce(undefined);
      oauthService.createClient.mockResolvedValueOnce({ clientId: 'new-id-2', clientSecret: 'new-secret-2' });
      repository.update.mockResolvedValueOnce({ ...mockTerminal, oauthClientId: 'new-id-2' });

      await service.rotateCredentials('term-uuid-1');

      expect(oauthService.createClient).toHaveBeenCalledWith('tenant-123', 'POS Counter 1', ['payments:authorize', 'payments:refund']);
    });

    it('should return ApiResponse.fail CONFLICT if terminal is not active', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.SUSPENDED,
      });

      const result = await service.rotateCredentials('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('should return ApiResponse.fail CONFLICT if terminal is revoked', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.REVOKED,
        revokedAt: new Date(),
      });

      const result = await service.rotateCredentials('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('should log audit on successful rotation', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        oauthClientId: 'old-id',
      });
      oauthService.listClients.mockResolvedValueOnce([
        { clientId: 'old-id', scopes: ['payments:authorize'], merchantId: 'tenant-123', terminalName: 'POS Counter 1', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ] as any);
      oauthService.revokeClient.mockResolvedValueOnce(undefined);
      oauthService.createClient.mockResolvedValueOnce({ clientId: 'new-id', clientSecret: 'new-secret' });
      repository.update.mockResolvedValueOnce({ ...mockTerminal, oauthClientId: 'new-id' });

      await service.rotateCredentials('term-uuid-1');

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'ROTATE_TERMINAL_CREDENTIALS',
        'terminal',
        'term-uuid-1',
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
        }),
      );
    });
  });

  // ─── Admin methods ───────────────────────────────────────────────────

  describe('Admin methods', () => {
    it('listAllTerminals should return ApiResponse.ok with all terminals when no tenantId filter', async () => {
      const terminal2: TerminalEntity = { ...mockTerminal, terminalId: 'term-uuid-2', tenantId: 'tenant-456' };
      repository.findAll.mockResolvedValueOnce([mockTerminal, terminal2]);

      const result = await service.listAllTerminals();

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual([mockTerminal, terminal2]);
      expect(repository.findAll).toHaveBeenCalledWith(undefined);
    });

    it('listAllTerminals should filter by tenantId when provided', async () => {
      repository.findByTenantId.mockResolvedValueOnce([mockTerminal]);

      const result = await service.listAllTerminals({ tenantId: 'tenant-123' });

      expect(result.ok).toBe(true);
      expect(result.data).toEqual([mockTerminal]);
      expect(repository.findByTenantId).toHaveBeenCalledWith('tenant-123', { tenantId: 'tenant-123' });
      expect(repository.findAll).not.toHaveBeenCalled();
    });

    it('getTerminalById should return ApiResponse.ok with terminal', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);

      const result = await service.getTerminalById('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(mockTerminal);
    });

    it('getTerminalById should return ApiResponse.fail NOT_FOUND when not found', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(null);

      const result = await service.getTerminalById('non-existent');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('adminSuspendTerminal should return ApiResponse.ok and suspend without tenantId requirement', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      const suspendedTerminal = { ...mockTerminal, status: TerminalStatus.SUSPENDED };
      repository.update.mockResolvedValueOnce(suspendedTerminal);

      const result = await service.adminSuspendTerminal('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.data!.status).toBe(TerminalStatus.SUSPENDED);
      expect(oauthService.deactivateClient).toHaveBeenCalledWith('oauth-client-uuid');
      expect(repository.update).toHaveBeenCalledWith('term-uuid-1', { status: TerminalStatus.SUSPENDED });
    });

    it('adminSuspendTerminal should return ApiResponse.fail NOT_FOUND when not found', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(null);

      const result = await service.adminSuspendTerminal('non-existent');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('adminSuspendTerminal should return ApiResponse.fail CONFLICT if not active', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.SUSPENDED,
      });

      const result = await service.adminSuspendTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('adminRevokeTerminal should return ApiResponse.ok and revoke without tenantId requirement', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      const revokedTerminal = { ...mockTerminal, status: TerminalStatus.REVOKED, revokedAt: new Date() };
      repository.update.mockResolvedValueOnce(revokedTerminal);

      const result = await service.adminRevokeTerminal('term-uuid-1');

      expect(result.ok).toBe(true);
      expect(result.data!.status).toBe(TerminalStatus.REVOKED);
      expect(oauthService.revokeClient).toHaveBeenCalledWith('oauth-client-uuid', 'tenant-123');
      expect(repository.update).toHaveBeenCalledWith('term-uuid-1', {
        status: TerminalStatus.REVOKED,
        revokedAt: expect.any(Date),
      });
    });

    it('adminRevokeTerminal should return ApiResponse.fail NOT_FOUND when not found', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(null);

      const result = await service.adminRevokeTerminal('non-existent');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('adminRevokeTerminal should return ApiResponse.fail CONFLICT if already revoked', async () => {
      repository.findByTerminalId.mockResolvedValueOnce({
        ...mockTerminal,
        status: TerminalStatus.REVOKED,
        revokedAt: new Date(),
      });

      const result = await service.adminRevokeTerminal('term-uuid-1');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('admin methods should log audit with actorId from context', async () => {
      repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
      repository.update.mockResolvedValueOnce({ ...mockTerminal, status: TerminalStatus.SUSPENDED });

      await service.adminSuspendTerminal('term-uuid-1');

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'ADMIN_SUSPEND_TERMINAL',
        'terminal',
        'term-uuid-1',
        expect.objectContaining({
          module: 'terminals',
          actorId: 'user-123',
        }),
      );
    });
  });

  // ─── findByOAuthClientId ─────────────────────────────────────────────

  describe('findByOAuthClientId', () => {
    it('should return terminal entity directly (internal lookup)', async () => {
      repository.findByOAuthClientId.mockResolvedValueOnce(mockTerminal);

      const result = await service.findByOAuthClientId('oauth-client-uuid');

      expect(result).toEqual(mockTerminal);
      expect(repository.findByOAuthClientId).toHaveBeenCalledWith('oauth-client-uuid');
    });
  });
});
