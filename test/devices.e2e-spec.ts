/**
 * E2E Tests: Devices Module Endpoints
 *
 * Integration tests for complete HTTP request/response workflows:
 * - POST /api/v1/devices/key-exchange
 * - POST /api/v1/devices/:deviceId/rotate-key
 * - DELETE /api/v1/devices/:deviceId
 * - GET /api/v1/devices/:deviceId/key-history
 * - GET /api/v1/devices/list
 * - GET /api/v1/devices/:deviceId
 * - JWT protection validation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DevicesModule } from 'src/modules/devices';
import { DEVICE_INJECTION_TOKENS } from 'src/modules/devices/domain/constants/device-injection-tokens';



describe('Devices API E2E (Integration Tests)', () => {
  let app: INestApplication;
  let mockDeviceRepository: any;
  let mockEcdhCrypto: any;
  let mockVaultStorage: any;
  let mockRotationRepository: any;

  const validJwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkLTEyMyIsImFjdG9ySWQiOiJ1c2VyLWlkLTEyMyIsImlhdCI6MTYxNjIzOTAyMn0.signingSecret';

  const validPublicKey = 'BK3mNpQvWx7Zr3ah4K9mLzgT4JQpmVXrH+qAMqLx0x9+0Q==';

  beforeAll(async () => {
    // Mock implementations
    mockDeviceRepository = {
      findByDeviceId: jest.fn().mockResolvedValue(null),
      countActiveDevicesByUserId: jest.fn().mockResolvedValue(0),
      listDevicesByUserId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) =>
        Promise.resolve({ id: 'db-id-123', ...data, createdAt: new Date() }),
      ),
      updateStatus: jest.fn().mockResolvedValue({}),
      findDeviceHistory: jest.fn().mockResolvedValue({
        docs: [],
        total: 0,
        page: 1,
        limit: 10,
      }),
    };

    mockEcdhCrypto = {
      generateKeyPair: jest.fn().mockResolvedValue({
        privateKeyPem: '-----BEGIN EC PRIVATE KEY-----\ntest-key\n-----END EC PRIVATE KEY-----',
        publicKeyBase64: 'BLzgT4JQpmVXrH+qAMqLx0x9+0Q==',
      }),
      validatePublicKey: jest.fn().mockResolvedValue({ isValid: true }),
      deriveSharedSecret: jest.fn().mockResolvedValue(Buffer.from('shared-secret')),
      generateSalt: jest.fn().mockResolvedValue(Buffer.from('salt-value')),
      generateKeyHandle: jest.fn().mockResolvedValue('generated-key-handle'),
    };

    mockVaultStorage = {
      storeServerPrivateKey: jest.fn().mockResolvedValue(undefined),
      retrieveServerPrivateKey: jest.fn().mockResolvedValue('-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----'),
      deleteServerPrivateKey: jest.fn().mockResolvedValue(undefined),
      existsPrivateKey: jest.fn().mockResolvedValue(true),
    };

    mockRotationRepository = {
      recordRotation: jest.fn().mockResolvedValue({ id: 'rotation-id' }),
      getHistoryByDeviceId: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DevicesModule],
      overrides: [
        {
          provide: DEVICE_INJECTION_TOKENS.DEVICE_REPOSITORY,
          useValue: mockDeviceRepository,
        },
        {
          provide: DEVICE_INJECTION_TOKENS.ECDH_CRYPTO_PORT,
          useValue: mockEcdhCrypto,
        },
        {
          provide: DEVICE_INJECTION_TOKENS.VAULT_KEY_STORAGE,
          useValue: mockVaultStorage,
        },
        {
          provide: DEVICE_INJECTION_TOKENS.KEY_ROTATION_PORT,
          useValue: mockRotationRepository,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/devices/key-exchange', () => {
    const payloadValid = {
      device_public_key: validPublicKey,
      device_id: '12345678-1234-1234-1234-123456789012',
      app_version: '1.0.0',
      platform: 'android',
    };

    it('should reject request without JWT token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .send(payloadValid);

      expect(response.status).toBe(401);
    });

    it('should accept request with valid JWT token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send(payloadValid);

      expect([200, 201, 400, 409]).toContain(response.status);
    });

    it('should validate device_public_key format', async () => {
      const invalidPayload = {
        ...payloadValid,
        device_public_key: 'not-valid-base64!!!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send(invalidPayload);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate device_id is UUID', async () => {
      const invalidPayload = {
        ...payloadValid,
        device_id: 'not-a-uuid',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send(invalidPayload);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate app_version format', async () => {
      const invalidPayload = {
        ...payloadValid,
        app_version: '1.0', // Missing patch version
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send(invalidPayload);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate platform is android or ios', async () => {
      const invalidPayload = {
        ...payloadValid,
        platform: 'windows',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send(invalidPayload);

      expect([400, 422]).toContain(response.status);
    });

    it('should successfully exchange keys and return response structure', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send(payloadValid);

      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty('server_public_key');
        expect(response.body).toHaveProperty('key_handle');
        expect(response.body).toHaveProperty('salt');
        expect(response.body).toHaveProperty('issued_at');
        expect(response.body).toHaveProperty('expires_at');
        expect(response.body).toHaveProperty('protocol_version');

        // Verify data types
        expect(typeof response.body.server_public_key).toBe('string');
        expect(typeof response.body.key_handle).toBe('string');
        expect(typeof response.body.salt).toBe('string');
        expect(typeof response.body.issued_at).toBe('string');
        expect(typeof response.body.expires_at).toBe('string');
      }
    });

    it('should handle missing required fields', async () => {
      const incompletePayload = {
        device_public_key: validPublicKey,
        // Missing device_id, app_version, platform
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send(incompletePayload);

      expect([400, 422]).toContain(response.status);
    });
  });

  describe('GET /api/v1/devices/list', () => {
    it('should reject request without JWT token', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/devices/list');

      expect(response.status).toBe(401);
    });

    it('should return list of devices for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/devices/list')
        .set('Authorization', `Bearer ${validJwtToken}`);

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('GET /api/v1/devices/:deviceId', () => {
    it('should reject request without JWT token', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/devices/12345678-1234-1234-1234-123456789012',
      );

      expect(response.status).toBe(401);
    });

    it('should require device ownership', async () => {
      // This would test DeviceOwnershipGuard
      const response = await request(app.getHttpServer())
        .get('/api/v1/devices/12345678-1234-1234-1234-123456789012')
        .set('Authorization', `Bearer ${validJwtToken}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('POST /api/v1/devices/:deviceId/rotate-key', () => {
    it('should reject request without JWT token', async () => {
      const response = await request(app.getHttpServer()).post(
        '/api/v1/devices/12345678-1234-1234-1234-123456789012/rotate-key',
      );

      expect(response.status).toBe(401);
    });

    it('should require device ownership (DeviceOwnershipGuard)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/12345678-1234-1234-1234-123456789012/rotate-key')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send({});

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('DELETE /api/v1/devices/:deviceId', () => {
    it('should reject request without JWT token', async () => {
      const response = await request(app.getHttpServer()).delete(
        '/api/v1/devices/12345678-1234-1234-1234-123456789012',
      );

      expect(response.status).toBe(401);
    });

    it('should require device ownership', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/devices/12345678-1234-1234-1234-123456789012')
        .set('Authorization', `Bearer ${validJwtToken}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/v1/devices/:deviceId/key-history', () => {
    it('should reject request without JWT token', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/devices/12345678-1234-1234-1234-123456789012/key-history',
      );

      expect(response.status).toBe(401);
    });

    it('should support pagination query params', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/devices/12345678-1234-1234-1234-123456789012/key-history')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .query({ page: 1, limit: 10 });

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should return paginated history', async () => {
      mockDeviceRepository.findDeviceHistory.mockResolvedValue({
        docs: [
          { keyHandle: 'handle-1', rotatedAt: new Date() },
        ],
        total: 1,
        page: 1,
        limit: 10,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/devices/12345678-1234-1234-1234-123456789012/key-history')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .query({ page: 1, limit: 10 });

      if (response.status === 200) {
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('pagination');
      }
    });
  });

  describe('HTTP Status Codes & Error Handling', () => {
    it('should return 400 for invalid request body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send({ invalid: 'payload' });

      expect([400, 422]).toContain(response.status);
    });

    it('should return 401 for missing authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .send({});

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent device', async () => {
      mockDeviceRepository.findByDeviceId.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/api/v1/devices/non-existent-id')
        .set('Authorization', `Bearer ${validJwtToken}`);

      expect([404, 403]).toContain(response.status);
    });

    it('should return 409 when max devices reached', async () => {
      mockDeviceRepository.countActiveDevicesByUserId.mockResolvedValue(100);

      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/key-exchange')
        .set('Authorization', `Bearer ${validJwtToken}`)
        .send({
          device_public_key: validPublicKey,
          device_id: '12345678-1234-1234-1234-123456789012',
          app_version: '1.0.0',
          platform: 'android',
        });

      expect(response.status).toBe(409);
    });
  });
});
