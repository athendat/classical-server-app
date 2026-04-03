import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as jwt from 'jsonwebtoken';
import { JwtTokenAdapter } from './jwt-token.adapter';
import { AsyncContextService } from 'src/common/context/async-context.service';

jest.mock('uuid', () => ({
  v4: () => 'mock-jti-uuid',
}));

// Generate a test RSA key pair
const { privateKey, publicKey } = (() => {
  const crypto = require('crypto');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
})();

describe('JwtTokenAdapter', () => {
  let adapter: JwtTokenAdapter;

  const mockJwksPort = {
    getActiveKey: jest.fn().mockResolvedValue({ kid: 'test-kid-1', publicKey }),
    getActivePrivateKey: jest.fn().mockResolvedValue(privateKey),
    getPublicKey: jest.fn().mockResolvedValue(publicKey),
  };

  const mockReplayProtectionPort = {
    registerJti: jest.fn().mockResolvedValue(true),
    isJtiUsed: jest.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtTokenAdapter,
        { provide: 'IJwksPort', useValue: mockJwksPort },
        { provide: 'IReplayProtectionPort', useValue: mockReplayProtectionPort },
        {
          provide: AsyncContextService,
          useValue: {
            getRequestId: jest.fn().mockReturnValue('req-test-123'),
            setTokenExpiration: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_ISSUER: 'test-issuer',
                JWT_AUDIENCE: 'test-audience',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<JwtTokenAdapter>(JwtTokenAdapter);
  });

  it('should include tenantId in signed JWT when payload contains tenantId', async () => {
    const payload = {
      sub: 'user:user-123',
      iss: 'test-issuer',
      aud: 'test-audience',
      scope: 'read write',
      expiresIn: 3600,
      tenantId: 'tenant-abc-123',
    };

    const result = await adapter.sign(payload);

    expect(result.isSuccess).toBe(true);

    const token = result.getValue();
    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(decoded.tenantId).toBe('tenant-abc-123');
  });

  it('should NOT include tenantId in signed JWT when payload does not contain tenantId', async () => {
    const payload = {
      sub: 'user:user-456',
      iss: 'test-issuer',
      aud: 'test-audience',
      scope: 'read write',
      expiresIn: 3600,
    };

    const result = await adapter.sign(payload);

    expect(result.isSuccess).toBe(true);

    const token = result.getValue();
    const decoded = jwt.decode(token) as Record<string, unknown>;

    expect(decoded.tenantId).toBeUndefined();
  });
});
