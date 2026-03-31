import { Test, TestingModule } from '@nestjs/testing';

import { TerminalService } from './terminal.service';
import { TERMINAL_INJECTION_TOKENS, TerminalType, TerminalCapability, TerminalStatus, TERMINAL_SCOPE_TEMPLATES } from '../domain/constants/terminal.constants';
import type { ITerminalRepository, TerminalEntity, TerminalFilters } from '../domain/ports/terminal-repository.port';
import { OAuthService } from '../../oauth/application/oauth.service';
import type { CreateTerminalDto } from '../dto/create-terminal.dto';
import type { UpdateTerminalDto } from '../dto/update-terminal.dto';

describe('TerminalService', () => {
  let service: TerminalService;
  let repository: jest.Mocked<ITerminalRepository>;
  let oauthService: jest.Mocked<Pick<OAuthService, 'createClient' | 'deactivateClient' | 'reactivateClient' | 'revokeClient' | 'listClients'>>;

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

    const mockOAuthService: jest.Mocked<Pick<OAuthService, 'createClient' | 'deactivateClient' | 'reactivateClient' | 'revokeClient' | 'listClients'>> = {
      createClient: jest.fn().mockResolvedValue({
        clientId: 'oauth-client-uuid',
        clientSecret: 'secret-hex-value',
      }),
      deactivateClient: jest.fn().mockResolvedValue(undefined),
      reactivateClient: jest.fn().mockResolvedValue(undefined),
      revokeClient: jest.fn().mockResolvedValue(undefined),
      listClients: jest.fn().mockResolvedValue([]),
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
      ],
    }).compile();

    service = module.get<TerminalService>(TerminalService);
    repository = module.get(TERMINAL_INJECTION_TOKENS.TERMINAL_REPOSITORY);
    oauthService = module.get(OAuthService);
  });

  it('createTerminal should create terminal with auto-provisioned OAuth credentials and return clientSecret', async () => {
    const dto: CreateTerminalDto = {
      name: 'POS Counter 1',
      type: TerminalType.PHYSICAL_POS,
      capabilities: [TerminalCapability.NFC, TerminalCapability.CHIP],
    };

    const result = await service.createTerminal('tenant-123', 'user-123', dto);

    // Verify OAuth client was created with correct args
    expect(oauthService.createClient).toHaveBeenCalledWith(
      'tenant-123',
      'POS Counter 1',
      TERMINAL_SCOPE_TEMPLATES[TerminalType.PHYSICAL_POS],
    );

    // Verify terminal was created with correct data
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-123',
        name: 'POS Counter 1',
        type: TerminalType.PHYSICAL_POS,
        capabilities: [TerminalCapability.NFC, TerminalCapability.CHIP],
        status: TerminalStatus.ACTIVE,
        oauthClientId: 'oauth-client-uuid',
        createdBy: 'user-123',
      }),
    );

    // Verify result contains terminal and credentials
    expect(result.terminal).toEqual(mockTerminal);
    expect(result.credentials.clientId).toBe('oauth-client-uuid');
    expect(result.credentials.clientSecret).toBe('secret-hex-value');
  });

  it('createTerminal should use physical_pos scope template when no custom scopes provided', async () => {
    const dto: CreateTerminalDto = {
      name: 'POS 1',
      type: TerminalType.PHYSICAL_POS,
      capabilities: [TerminalCapability.NFC],
    };

    await service.createTerminal('tenant-123', 'user-123', dto);

    expect(oauthService.createClient).toHaveBeenCalledWith(
      'tenant-123',
      'POS 1',
      ['payments:authorize', 'payments:refund', 'transactions:read'],
    );
  });

  it('createTerminal should use web scope template', async () => {
    const dto: CreateTerminalDto = {
      name: 'Web Terminal',
      type: TerminalType.WEB,
      capabilities: [TerminalCapability.MANUAL_ENTRY],
    };

    await service.createTerminal('tenant-123', 'user-123', dto);

    expect(oauthService.createClient).toHaveBeenCalledWith(
      'tenant-123',
      'Web Terminal',
      ['payments:authorize', 'transactions:read'],
    );
  });

  it('createTerminal should use kiosk scope template', async () => {
    const dto: CreateTerminalDto = {
      name: 'Kiosk 1',
      type: TerminalType.KIOSK,
      capabilities: [TerminalCapability.QR_DISPLAY],
    };

    await service.createTerminal('tenant-123', 'user-123', dto);

    expect(oauthService.createClient).toHaveBeenCalledWith(
      'tenant-123',
      'Kiosk 1',
      ['payments:authorize'],
    );
  });

  it('createTerminal should use custom scopes when provided (override template)', async () => {
    const dto: CreateTerminalDto = {
      name: 'Custom POS',
      type: TerminalType.PHYSICAL_POS,
      capabilities: [TerminalCapability.NFC],
      scopes: ['payments:authorize'],
    };

    await service.createTerminal('tenant-123', 'user-123', dto);

    expect(oauthService.createClient).toHaveBeenCalledWith(
      'tenant-123',
      'Custom POS',
      ['payments:authorize'],
    );
  });

  it('getTerminal should return null if tenantId does not match (ownership check)', async () => {
    repository.findByTerminalId.mockResolvedValueOnce({
      ...mockTerminal,
      tenantId: 'tenant-A',
    });

    const result = await service.getTerminal('tenant-B', 'term-uuid-1');

    expect(result).toBeNull();
  });

  it('listTerminals should pass filters to repository', async () => {
    const terminals = [mockTerminal, { ...mockTerminal, terminalId: 'term-uuid-2' }];
    repository.findByTenantId.mockResolvedValueOnce(terminals);

    const filters: TerminalFilters = { type: 'web', status: 'active' };
    const result = await service.listTerminals('tenant-123', filters);

    expect(repository.findByTenantId).toHaveBeenCalledWith('tenant-123', filters);
    expect(result).toEqual(terminals);
  });

  it('updateTerminal should only update allowed fields', async () => {
    repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
    const updatedTerminal = { ...mockTerminal, name: 'New Name' };
    repository.update.mockResolvedValueOnce(updatedTerminal);

    const dto: UpdateTerminalDto = {
      name: 'New Name',
      location: { label: 'Lobby', address: '123 Main St' },
    };

    const result = await service.updateTerminal('tenant-123', 'term-uuid-1', dto);

    expect(repository.update).toHaveBeenCalledWith('term-uuid-1', {
      name: 'New Name',
      location: { label: 'Lobby', address: '123 Main St' },
    });
    expect(result).toEqual(updatedTerminal);
  });

  it('updateTerminal should return null for non-existent terminal', async () => {
    repository.findByTerminalId.mockResolvedValueOnce(null);

    const result = await service.updateTerminal('tenant-123', 'non-existent', { name: 'X' });

    expect(result).toBeNull();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('suspendTerminal should set status to suspended and deactivate OAuth', async () => {
    repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
    const suspendedTerminal = { ...mockTerminal, status: TerminalStatus.SUSPENDED };
    repository.update.mockResolvedValueOnce(suspendedTerminal);

    const result = await service.suspendTerminal('tenant-123', 'term-uuid-1');

    expect(oauthService.deactivateClient).toHaveBeenCalledWith('oauth-client-uuid');
    expect(repository.update).toHaveBeenCalledWith('term-uuid-1', { status: TerminalStatus.SUSPENDED });
    expect(result.status).toBe(TerminalStatus.SUSPENDED);
  });

  it('suspendTerminal should throw if terminal is not active', async () => {
    repository.findByTerminalId.mockResolvedValueOnce({
      ...mockTerminal,
      status: TerminalStatus.SUSPENDED,
    });

    await expect(
      service.suspendTerminal('tenant-123', 'term-uuid-1'),
    ).rejects.toThrow("Cannot suspend terminal with status 'suspended'");
  });

  it('reactivateTerminal should set status to active and reactivate OAuth', async () => {
    repository.findByTerminalId.mockResolvedValueOnce({
      ...mockTerminal,
      status: TerminalStatus.SUSPENDED,
    });
    const reactivatedTerminal = { ...mockTerminal, status: TerminalStatus.ACTIVE };
    repository.update.mockResolvedValueOnce(reactivatedTerminal);

    const result = await service.reactivateTerminal('tenant-123', 'term-uuid-1');

    expect(oauthService.reactivateClient).toHaveBeenCalledWith('oauth-client-uuid');
    expect(repository.update).toHaveBeenCalledWith('term-uuid-1', { status: TerminalStatus.ACTIVE });
    expect(result.status).toBe(TerminalStatus.ACTIVE);
  });

  it('reactivateTerminal should throw if terminal is revoked', async () => {
    repository.findByTerminalId.mockResolvedValueOnce({
      ...mockTerminal,
      status: TerminalStatus.REVOKED,
      revokedAt: new Date(),
    });

    await expect(
      service.reactivateTerminal('tenant-123', 'term-uuid-1'),
    ).rejects.toThrow('Cannot reactivate a revoked terminal');
  });

  it('revokeTerminal should set status to revoked with revokedAt and revoke OAuth permanently', async () => {
    repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
    const revokedTerminal = { ...mockTerminal, status: TerminalStatus.REVOKED, revokedAt: new Date() };
    repository.update.mockResolvedValueOnce(revokedTerminal);

    const result = await service.revokeTerminal('tenant-123', 'term-uuid-1');

    expect(oauthService.revokeClient).toHaveBeenCalledWith('oauth-client-uuid', 'tenant-123');
    expect(repository.update).toHaveBeenCalledWith('term-uuid-1', {
      status: TerminalStatus.REVOKED,
      revokedAt: expect.any(Date),
    });
    expect(result.status).toBe(TerminalStatus.REVOKED);
  });

  it('revokeTerminal should throw if terminal is already revoked', async () => {
    repository.findByTerminalId.mockResolvedValueOnce({
      ...mockTerminal,
      status: TerminalStatus.REVOKED,
      revokedAt: new Date(),
    });

    await expect(
      service.revokeTerminal('tenant-123', 'term-uuid-1'),
    ).rejects.toThrow('Terminal is already revoked');
  });

  it('findByOAuthClientId should return terminal', async () => {
    repository.findByOAuthClientId.mockResolvedValueOnce(mockTerminal);

    const result = await service.findByOAuthClientId('oauth-client-uuid');

    expect(result).toEqual(mockTerminal);
    expect(repository.findByOAuthClientId).toHaveBeenCalledWith('oauth-client-uuid');
  });

  it('rotateCredentials should revoke old client, create new one, and return new secret', async () => {
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

    const result = await service.rotateCredentials('tenant-123', 'term-uuid-1');

    expect(oauthService.revokeClient).toHaveBeenCalledWith('old-id', 'tenant-123');
    expect(oauthService.createClient).toHaveBeenCalledWith('tenant-123', 'POS Counter 1', ['payments:authorize', 'transactions:read']);
    expect(repository.update).toHaveBeenCalledWith('term-uuid-1', { oauthClientId: 'new-id' });
    expect(result).toEqual({ clientId: 'new-id', clientSecret: 'new-secret' });
  });

  it('rotateCredentials should carry over scopes from old client to new', async () => {
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

    await service.rotateCredentials('tenant-123', 'term-uuid-1');

    expect(oauthService.createClient).toHaveBeenCalledWith('tenant-123', 'POS Counter 1', ['payments:authorize', 'payments:refund']);
  });

  it('rotateCredentials should throw if terminal is not active (suspended)', async () => {
    repository.findByTerminalId.mockResolvedValueOnce({
      ...mockTerminal,
      status: TerminalStatus.SUSPENDED,
    });

    await expect(
      service.rotateCredentials('tenant-123', 'term-uuid-1'),
    ).rejects.toThrow('Can only rotate credentials for active terminals');
  });

  it('rotateCredentials should throw if terminal is revoked', async () => {
    repository.findByTerminalId.mockResolvedValueOnce({
      ...mockTerminal,
      status: TerminalStatus.REVOKED,
      revokedAt: new Date(),
    });

    await expect(
      service.rotateCredentials('tenant-123', 'term-uuid-1'),
    ).rejects.toThrow('Can only rotate credentials for active terminals');
  });

  // ─── Admin methods (Slice 4) ───────────────────────────────────────

  it('listAllTerminals should return all terminals when no tenantId filter', async () => {
    const terminal2: TerminalEntity = { ...mockTerminal, terminalId: 'term-uuid-2', tenantId: 'tenant-456' };
    repository.findAll.mockResolvedValueOnce([mockTerminal, terminal2]);

    const result = await service.listAllTerminals();

    expect(repository.findAll).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([mockTerminal, terminal2]);
  });

  it('listAllTerminals should filter by tenantId when provided', async () => {
    repository.findByTenantId.mockResolvedValueOnce([mockTerminal]);

    const result = await service.listAllTerminals({ tenantId: 'tenant-123' });

    expect(repository.findByTenantId).toHaveBeenCalledWith('tenant-123', { tenantId: 'tenant-123' });
    expect(repository.findAll).not.toHaveBeenCalled();
    expect(result).toEqual([mockTerminal]);
  });

  it('getTerminalById should return terminal without tenant ownership check', async () => {
    repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);

    const result = await service.getTerminalById('term-uuid-1');

    expect(repository.findByTerminalId).toHaveBeenCalledWith('term-uuid-1');
    expect(result).toEqual(mockTerminal);
  });

  it('adminSuspendTerminal should suspend without tenantId requirement', async () => {
    repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
    const suspendedTerminal = { ...mockTerminal, status: TerminalStatus.SUSPENDED };
    repository.update.mockResolvedValueOnce(suspendedTerminal);

    const result = await service.adminSuspendTerminal('term-uuid-1');

    expect(oauthService.deactivateClient).toHaveBeenCalledWith('oauth-client-uuid');
    expect(repository.update).toHaveBeenCalledWith('term-uuid-1', { status: TerminalStatus.SUSPENDED });
    expect(result.status).toBe(TerminalStatus.SUSPENDED);
  });

  it('adminRevokeTerminal should revoke without tenantId requirement', async () => {
    repository.findByTerminalId.mockResolvedValueOnce(mockTerminal);
    const revokedTerminal = { ...mockTerminal, status: TerminalStatus.REVOKED, revokedAt: new Date() };
    repository.update.mockResolvedValueOnce(revokedTerminal);

    const result = await service.adminRevokeTerminal('term-uuid-1');

    expect(oauthService.revokeClient).toHaveBeenCalledWith('oauth-client-uuid', 'tenant-123');
    expect(repository.update).toHaveBeenCalledWith('term-uuid-1', {
      status: TerminalStatus.REVOKED,
      revokedAt: expect.any(Date),
    });
    expect(result.status).toBe(TerminalStatus.REVOKED);
    expect(result.revokedAt).toBeDefined();
  });
});
