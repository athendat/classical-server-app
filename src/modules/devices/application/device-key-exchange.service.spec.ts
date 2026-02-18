/**
 * Unit Tests: DeviceKeyExchangeService
 *
 * Tests for ECDH key exchange flow:
 * - Validation of device public key
 * - Key pair generation
 * - Shared secret derivation
 * - Storage in Vault
 * - Device persistence
 * - Event emission
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { DeviceKeyExchangeService } from './device-key-exchange.service';
import { DEVICE_INJECTION_TOKENS } from '../domain/constants/device-injection-tokens';

import type { IDeviceRepository } from '../domain/ports/device-repository.port';
import type { IEcdhCryptoPort, KeyPairResult } from '../domain/ports/ecdh-crypto.port';
import type { IVaultKeyStorage } from '../domain/ports/vault-key-storage.port';
import type { IKeyRotationPort } from '../domain/ports/key-rotation.port';

import { DeviceKeyExchangeRequestDto } from '../dto/device-key-exchange-request.dto';
import { DeviceKeyStatus } from '../domain/models/device-key.model';
import { DEVICE_KEY_CONSTANTS } from '../domain/constants/device-key.constants';

describe('DeviceKeyExchangeService (Unit Tests)', () => {
  let service: DeviceKeyExchangeService;
  let mockDeviceRepository: Partial<IDeviceRepository>;
  let mockEcdhCrypto: Partial<IEcdhCryptoPort>;
  let mockVaultStorage: Partial<IVaultKeyStorage>;
  let mockRotationRepository: Partial<IKeyRotationPort>;
  let mockEventEmitter: Partial<EventEmitter2>;

  beforeEach(async () => {
    // Mock implementations
    mockDeviceRepository = {
      findByDeviceId: jest.fn().mockResolvedValue(null),
      countActiveDevicesByUserId: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'db-id', ...data })),
      updateStatus: jest.fn().mockResolvedValue({}),
    };

    mockEcdhCrypto = {
      generateKeyPair: jest.fn().mockResolvedValue({
        privateKeyPem: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----',
        publicKeyBase64: 'BK3mNpQvWx7Zr3ah4K9mLzgT4JQpmVXrH+qAMqLx0x9+0Q==',
      } as KeyPairResult),
      validatePublicKey: jest.fn().mockResolvedValue({ isValid: true }),
      deriveSharedSecret: jest.fn().mockResolvedValue(Buffer.from('shared-secret-32-bytes-long')),
      generateSalt: jest.fn().mockResolvedValue(Buffer.from('salt-32-bytes')),
      generateKeyHandle: jest.fn().mockImplementation(() => 
        Promise.resolve(Math.random().toString(36).substring(2, 34))
      ),
    };

    mockVaultStorage = {
      storeServerPrivateKey: jest.fn().mockResolvedValue(undefined),
    };

    mockRotationRepository = {
      recordRotation: jest.fn().mockResolvedValue({ id: 'rotation-record-id' }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceKeyExchangeService,
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
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<DeviceKeyExchangeService>(DeviceKeyExchangeService);
  });

  describe('exchangePublicKeyWithDevice', () => {
    const userId = 'user-uuid-123';
    const validRequest: DeviceKeyExchangeRequestDto = {
      device_public_key: 'BK3mNpQvWx7Zr3ah4K9mLzgT4JQpmVXrH+qAMqLx0x9+0Q==',
      device_id: '12345678-1234-1234-1234-123456789012',
      app_version: '1.0.0',
      platform: 'android',
    };

    it('should reject request without user ID', async () => {
      await expect(
        service.exchangePublicKeyWithDevice('', validRequest),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid device public key', async () => {
      (mockEcdhCrypto.validatePublicKey as jest.Mock).mockResolvedValue({
        isValid: false,
        reason: 'Invalid key format',
      });

      await expect(
        service.exchangePublicKeyWithDevice(userId, validRequest),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when max devices per user is reached', async () => {
      (mockDeviceRepository.countActiveDevicesByUserId as jest.Mock).mockResolvedValue(
        DEVICE_KEY_CONSTANTS.MAX_DEVICES_PER_USER,
      );

      await expect(
        service.exchangePublicKeyWithDevice(userId, validRequest),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully exchange keys for new device', async () => {
      const response = await service.exchangePublicKeyWithDevice(userId, validRequest);

      // Verify response structure
      expect(response).toHaveProperty('server_public_key');
      expect(response).toHaveProperty('key_handle');
      expect(response).toHaveProperty('salt');
      expect(response).toHaveProperty('issued_at');
      expect(response).toHaveProperty('expires_at');

      // Verify service calls
      expect(mockEcdhCrypto.generateKeyPair).toHaveBeenCalled();
      expect(mockEcdhCrypto.deriveSharedSecret).toHaveBeenCalled();
      expect(mockEcdhCrypto.generateSalt).toHaveBeenCalled();
      expect(mockVaultStorage.storeServerPrivateKey).toHaveBeenCalled();
      expect(mockDeviceRepository.create).toHaveBeenCalled();

      // Verify event emission
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'device.registered',
        expect.any(Object),
      );
    });

    it('should rotate key when device already exists', async () => {
      const existingDevice = {
        id: 'existing-id',
        deviceId: validRequest.device_id,
        userId,
        keyHandle: 'old-key-handle',
        status: DeviceKeyStatus.ACTIVE,
      };

      (mockDeviceRepository.findByDeviceId as jest.Mock).mockResolvedValue(existingDevice);

      await service.exchangePublicKeyWithDevice(userId, validRequest);

      // Verify rotation was initiated
      expect(mockDeviceRepository.updateStatus).toHaveBeenCalledWith(
        existingDevice.id,
        DeviceKeyStatus.ROTATED,
      );

      expect(mockRotationRepository.recordRotation).toHaveBeenCalled();

      // Verify rotation event
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'device.key.rotated',
        expect.any(Object),
      );
    });

    it('should store private key in Vault', async () => {
      await service.exchangePublicKeyWithDevice(userId, validRequest);

      expect(mockVaultStorage.storeServerPrivateKey).toHaveBeenCalledWith(
        expect.any(String), // keyHandle
        expect.stringContaining('-----BEGIN EC PRIVATE KEY-----'),
      );
    });

    it('should generate valid expiration date (365 days from now)', async () => {
      const beforeTime = Date.now();
      const response = await service.exchangePublicKeyWithDevice(userId, validRequest);
      const afterTime = Date.now();

      const expiresDate = new Date(response.expires_at);
      const issuedDate = new Date(response.issued_at);
      const diffDays = (expiresDate.getTime() - issuedDate.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(DEVICE_KEY_CONSTANTS.KEY_VALIDITY_DAYS, 0);

      // Verify times are within acceptable range
      expect(new Date(response.issued_at).getTime()).toBeGreaterThanOrEqual(beforeTime - 100);
      expect(new Date(response.issued_at).getTime()).toBeLessThanOrEqual(afterTime + 100);
    });

    it('should include platform and app version in persisted device', async () => {
      await service.exchangePublicKeyWithDevice(userId, validRequest);

      expect(mockDeviceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: validRequest.platform,
          appVersion: validRequest.app_version,
          userId,
          deviceId: validRequest.device_id,
        }),
      );
    });
  });
});
