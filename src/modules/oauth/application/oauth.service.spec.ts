import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { OAuthService } from './oauth.service';
import { OAUTH_INJECTION_TOKENS } from '../domain/constants/oauth.constants';
import { IOAuthClientRepository, OAuthClientEntity } from '../domain/ports/oauth-client-repository.port';

describe('OAuthService', () => {
  let service: OAuthService;
  let repository: jest.Mocked<IOAuthClientRepository>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const mockRepository: jest.Mocked<IOAuthClientRepository> = {
      create: jest.fn().mockResolvedValue({}),
      findByClientId: jest.fn().mockResolvedValue(null),
      findByMerchantId: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(null),
    };

    const mockJwtService: Partial<jest.Mocked<JwtService>> = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        {
          provide: OAUTH_INJECTION_TOKENS.OAUTH_CLIENT_REPOSITORY,
          useValue: mockRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
    repository = module.get(OAUTH_INJECTION_TOKENS.OAUTH_CLIENT_REPOSITORY);
    jwtService = module.get(JwtService);
  });

  it('createClient should return clientId in UUID format and secret as 64 hex chars', async () => {
    const result = await service.createClient('merchant-123', 'Terminal A', ['payments:authorize']);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result.clientId).toMatch(uuidRegex);

    const hexRegex = /^[0-9a-f]{64}$/;
    expect(result.clientSecret).toMatch(hexRegex);
  });

  it('createClient should store a hashed secret, not plaintext', async () => {
    const result = await service.createClient('merchant-123', 'Terminal A', ['payments:authorize']);

    expect(repository.create).toHaveBeenCalledTimes(1);
    const storedArg = repository.create.mock.calls[0][0];

    // The stored hash should NOT be the plaintext secret
    expect(storedArg.clientSecretHash).not.toBe(result.clientSecret);
    // Argon2 hashes start with $argon2
    expect(storedArg.clientSecretHash).toMatch(/^\$argon2/);
  });

  it('issueToken should return a valid JWT for correct credentials', async () => {
    const plainSecret = 'a'.repeat(64);
    const hashedSecret = await argon2.hash(plainSecret);

    const mockClient: OAuthClientEntity = {
      clientId: 'test-client-id',
      clientSecretHash: hashedSecret,
      merchantId: 'merchant-123',
      terminalName: 'Terminal A',
      scopes: ['payments:authorize', 'transactions:read'],
      isActive: true,
    };

    repository.findByClientId.mockResolvedValue(mockClient);

    const result = await service.issueToken('test-client-id', plainSecret);

    expect(result.access_token).toBe('mock.jwt.token');
    expect(result.token_type).toBe('Bearer');
    expect(result.expires_in).toBe(28800);
    expect(result.scope).toBe('payments:authorize transactions:read');

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'test-client-id',
        merchantId: 'merchant-123',
        scopes: ['payments:authorize', 'transactions:read'],
        type: 'oauth_client_credentials',
      }),
      expect.objectContaining({
        expiresIn: 28800,
      }),
    );
  });

  it('issueToken should reject wrong secret', async () => {
    const plainSecret = 'a'.repeat(64);
    const hashedSecret = await argon2.hash(plainSecret);

    const mockClient: OAuthClientEntity = {
      clientId: 'test-client-id',
      clientSecretHash: hashedSecret,
      merchantId: 'merchant-123',
      terminalName: 'Terminal A',
      scopes: ['payments:authorize'],
      isActive: true,
    };

    repository.findByClientId.mockResolvedValue(mockClient);

    await expect(
      service.issueToken('test-client-id', 'wrong-secret'),
    ).rejects.toThrow('Invalid client credentials');
  });

  it('issueToken should reject revoked client', async () => {
    const plainSecret = 'a'.repeat(64);
    const hashedSecret = await argon2.hash(plainSecret);

    const mockClient: OAuthClientEntity = {
      clientId: 'test-client-id',
      clientSecretHash: hashedSecret,
      merchantId: 'merchant-123',
      terminalName: 'Terminal A',
      scopes: ['payments:authorize'],
      isActive: false,
      revokedAt: new Date(),
    };

    repository.findByClientId.mockResolvedValue(mockClient);

    await expect(
      service.issueToken('test-client-id', plainSecret),
    ).rejects.toThrow('Client has been revoked');
  });

  it('revokeClient should set isActive=false and revokedAt', async () => {
    const mockClient: OAuthClientEntity = {
      clientId: 'test-client-id',
      clientSecretHash: 'some-hash',
      merchantId: 'merchant-123',
      terminalName: 'Terminal A',
      scopes: ['payments:authorize'],
      isActive: true,
    };

    repository.findByClientId.mockResolvedValue(mockClient);
    repository.update.mockResolvedValue({ ...mockClient, isActive: false, revokedAt: new Date() });

    await service.revokeClient('test-client-id', 'merchant-123');

    expect(repository.update).toHaveBeenCalledWith(
      'test-client-id',
      expect.objectContaining({
        isActive: false,
        revokedAt: expect.any(Date),
      }),
    );
  });

  it('listClients should return only specified merchant clients without secret hashes', async () => {
    const mockClients: OAuthClientEntity[] = [
      {
        clientId: 'client-1',
        clientSecretHash: '$argon2id$hash1',
        merchantId: 'merchant-123',
        terminalName: 'Terminal A',
        scopes: ['payments:authorize'],
        isActive: true,
      },
      {
        clientId: 'client-2',
        clientSecretHash: '$argon2id$hash2',
        merchantId: 'merchant-123',
        terminalName: 'Terminal B',
        scopes: ['transactions:read'],
        isActive: true,
      },
    ];

    repository.findByMerchantId.mockResolvedValue(mockClients);

    const result = await service.listClients('merchant-123');

    expect(result).toHaveLength(2);
    expect(repository.findByMerchantId).toHaveBeenCalledWith('merchant-123');

    // Verify no secret hashes are exposed
    result.forEach((client) => {
      expect(client).not.toHaveProperty('clientSecretHash');
      expect(client).toHaveProperty('clientId');
      expect(client).toHaveProperty('merchantId');
      expect(client).toHaveProperty('terminalName');
      expect(client).toHaveProperty('scopes');
      expect(client).toHaveProperty('isActive');
    });
  });
});
