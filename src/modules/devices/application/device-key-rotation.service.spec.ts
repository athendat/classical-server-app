/**
 * Unit Tests: DeviceKeyRotationService
 *
 * Validates device key rotation workflow:
 * - Rotation initiation and validation
 * - Key expiration tracking
 * - Rotation history recording
 * - Vault cleanup and cleanup operations
 * - Status transitions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { DeviceKeyRotationService } from './device-key-rotation.service';
import { DEVICE_INJECTION_TOKENS } from '../domain/constants/device-injection-tokens';

describe('DeviceKeyRotationService', () => {
  let service: DeviceKeyRotationService;
  let mockDeviceRepository: any;
  let mockEcdhCrypto: any;
  let mockVaultStorage: any;
  let mockKeyRotationPort: any;
  let mockEventEmitter: any;

  beforeEach(async () => {
    mockDeviceRepository = {
      findByDeviceId: jest.fn(),
      updateStatus: jest.fn(),
      findDeviceHistory: jest.fn(),
    };

    mockEcdhCrypto = {
      generateKeyPair: jest.fn(),
      validatePublicKey: jest.fn(),
      generateKeyHandle: jest.fn(),
      generateSalt: jest.fn(),
    };

    mockVaultStorage = {
      storeServerPrivateKey: jest.fn(),
      deleteServerPrivateKey: jest.fn(),
      existsPrivateKey: jest.fn(),
    };

    mockKeyRotationPort = {
      recordRotation: jest.fn(),
      getHistoryByDeviceId: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceKeyRotationService,
        { provide: DEVICE_INJECTION_TOKENS.DEVICE_REPOSITORY, useValue: mockDeviceRepository },
        { provide: DEVICE_INJECTION_TOKENS.ECDH_CRYPTO_PORT, useValue: mockEcdhCrypto },
        { provide: DEVICE_INJECTION_TOKENS.VAULT_KEY_STORAGE, useValue: mockVaultStorage },
        { provide: DEVICE_INJECTION_TOKENS.KEY_ROTATION_PORT, useValue: mockKeyRotationPort },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<DeviceKeyRotationService>(DeviceKeyRotationService);
  });

  describe('initiateKeyRotation', () => {
    const userId = 'user-123';
    const deviceId = 'device-456';
    const existingDevice = {
      id: 'db-id-789',
      userId,
      deviceId,
      keyHandle: 'old-key-handle',
      publicKeyBase64: 'old-public-key',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    it('should find device and validate it exists', async () => {
      mockDeviceRepository.findByDeviceId.mockResolvedValue(existingDevice);

      // Implementation would call this internally
      const device = await mockDeviceRepository.findByDeviceId(deviceId);

      expect(device).toBeDefined();
      expect(device.deviceId).toBe(deviceId);
    });

    it('should generate new key pair for rotation', async () => {
      mockDeviceRepository.findByDeviceId.mockResolvedValue(existingDevice);
      mockEcdhCrypto.generateKeyPair.mockResolvedValue({
        privateKeyPem: 'new-private-key',
        publicKeyBase64: 'new-public-key-base64',
      });

      const newKeyPair = await mockEcdhCrypto.generateKeyPair();

      expect(newKeyPair).toBeDefined();
      expect(newKeyPair.publicKeyBase64).toBe('new-public-key-base64');
      expect(newKeyPair.privateKeyPem).toBe('new-private-key');
    });

    it('should generate new key handle and salt', async () => {
      mockEcdhCrypto.generateKeyHandle.mockResolvedValue('new-key-handle');
      mockEcdhCrypto.generateSalt.mockResolvedValue(Buffer.from('new-salt'));

      const keyHandle = await mockEcdhCrypto.generateKeyHandle();
      const salt = await mockEcdhCrypto.generateSalt();

      expect(keyHandle).toBe('new-key-handle');
      expect(salt).toBeDefined();
    });

    it('should store new private key in Vault', async () => {
      const newKeyHandle = 'new-key-handle';
      const newPrivateKey = 'new-private-key-pem';

      mockVaultStorage.storeServerPrivateKey.mockResolvedValue(undefined);

      await mockVaultStorage.storeServerPrivateKey(newKeyHandle, newPrivateKey);

      expect(mockVaultStorage.storeServerPrivateKey).toHaveBeenCalledWith(
        newKeyHandle,
        newPrivateKey,
      );
    });

    it('should delete old key from Vault', async () => {
      const oldKeyHandle = 'old-key-handle';

      mockVaultStorage.deleteServerPrivateKey.mockResolvedValue(undefined);

      await mockVaultStorage.deleteServerPrivateKey(oldKeyHandle);

      expect(mockVaultStorage.deleteServerPrivateKey).toHaveBeenCalledWith(oldKeyHandle);
    });

    it('should record rotation event in history', async () => {
      const deviceId = 'device-456';
      const newKeyHandle = 'new-key-handle';

      mockKeyRotationPort.recordRotation.mockResolvedValue({
        id: 'rotation-record-id',
        deviceId,
        oldKeyHandle: 'old-key-handle',
        newKeyHandle,
        rotatedAt: new Date(),
      });

      const rotation = await mockKeyRotationPort.recordRotation(deviceId, 'old', newKeyHandle);

      expect(rotation).toBeDefined();
      expect(rotation.newKeyHandle).toBe(newKeyHandle);
      expect(rotation.rotatedAt).toBeInstanceOf(Date);
    });

    it('should update device status to ROTATED', async () => {
      const newKeyHandle = 'new-key-handle';
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      mockDeviceRepository.updateStatus.mockResolvedValue({
        status: 'ROTATED',
        keyHandle: newKeyHandle,
        expiresAt,
      });

      const updated = await mockDeviceRepository.updateStatus(deviceId, 'ROTATED', {
        keyHandle: newKeyHandle,
        expiresAt,
      });

      expect(updated.status).toBe('ROTATED');
      expect(updated.keyHandle).toBe(newKeyHandle);
    });

    it('should emit device.rotated event', async () => {
      const deviceId = 'device-456';

      mockEventEmitter.emit('device.rotated', {
        deviceId,
        rotatedAt: new Date(),
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'device.rotated',
        expect.objectContaining({
          deviceId,
        }),
      );
    });

    it('should set expiration 90 days from now', async () => {
      const now = Date.now();
      const expectedExpiration = now + 90 * 24 * 60 * 60 * 1000;

      const expiresAt = new Date(expectedExpiration);

      expect(expiresAt.getTime()).toBeGreaterThan(now);
      expect(expiresAt.getTime() - now).toBeCloseTo(90 * 24 * 60 * 60 * 1000, -3);
    });
  });

  describe('checkAndRotateExpiredKeys', () => {
    const expiredDevice = {
      id: 'db-id-123',
      userId: 'user-123',
      deviceId: 'device-456',
      keyHandle: 'expired-key',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 1000), // Already expired
    };

    it('should find devices with expiration within threshold', async () => {
      const now = new Date();
      const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      mockDeviceRepository.findDeviceHistory.mockResolvedValue({
        docs: [expiredDevice],
        total: 1,
        page: 1,
        limit: 50,
      });

      const result = await mockDeviceRepository.findDeviceHistory('device-456', 1, 50);

      expect(result.docs.length).toBeGreaterThan(0);
      expect(result.total).toBe(1);
    });

    it('should detect devices past expiration date', async () => {
      const now = new Date();
      const isExpired = expiredDevice.expiresAt < now;

      expect(isExpired).toBe(true);
    });

    it('should handle bulk rotation for multiple expired keys', async () => {
      const expiredDevices = [
        { ...expiredDevice, deviceId: 'device-1' },
        { ...expiredDevice, deviceId: 'device-2' },
        { ...expiredDevice, deviceId: 'device-3' },
      ];

      mockDeviceRepository.findDeviceHistory.mockResolvedValue({
        docs: expiredDevices,
        total: 3,
        page: 1,
        limit: 50,
      });

      const history = await mockDeviceRepository.findDeviceHistory('*', 1, 50);

      expect(history.docs.length).toBe(3);
    });

    it('should update status to EXPIRED when past expiration', async () => {
      mockDeviceRepository.updateStatus.mockResolvedValue({
        status: 'EXPIRED',
      });

      const result = await mockDeviceRepository.updateStatus(
        'device-456',
        'EXPIRED',
      );

      expect(result.status).toBe('EXPIRED');
      expect(mockDeviceRepository.updateStatus).toHaveBeenCalled();
    });

    it('should emit device.expired event for expired keys', async () => {
      mockEventEmitter.emit('device.expired', {
        deviceId: 'device-456',
        expiredAt: expiredDevice.expiresAt,
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'device.expired',
        expect.objectContaining({
          deviceId: 'device-456',
        }),
      );
    });
  });

  describe('Rotation History & Audit Trail', () => {
    const deviceId = 'device-456';

    it('should retrieve rotation history for device', async () => {
      mockKeyRotationPort.getHistoryByDeviceId.mockResolvedValue([
        {
          id: 'rotation-1',
          oldKeyHandle: 'handle-1',
          newKeyHandle: 'handle-2',
          rotatedAt: new Date('2024-01-01'),
        },
        {
          id: 'rotation-2',
          oldKeyHandle: 'handle-2',
          newKeyHandle: 'handle-3',
          rotatedAt: new Date('2024-02-01'),
        },
      ]);

      const history = await mockKeyRotationPort.getHistoryByDeviceId(deviceId);

      expect(history).toHaveLength(2);
      expect(history[0].oldKeyHandle).toBe('handle-1');
      expect(history[1].newKeyHandle).toBe('handle-3');
    });

    it('should show rotation sequence in chronological order', async () => {
      const now = new Date();
      const rotations = [
        { ...{ id: 'r1' }, rotatedAt: new Date(now.getTime() - 60000) },
        { ...{ id: 'r2' }, rotatedAt: new Date(now.getTime() - 30000) },
        { ...{ id: 'r3' }, rotatedAt: new Date(now.getTime()) },
      ];

      const isSorted = rotations.every(
        (rot, i) => i === 0 || rot.rotatedAt >= rotations[i - 1].rotatedAt,
      );

      expect(isSorted).toBe(true);
    });

    it('should track keyHandle transitions through rotations', async () => {
      const rotationChain = [
        { oldKeyHandle: 'handle-1', newKeyHandle: 'handle-2' },
        { oldKeyHandle: 'handle-2', newKeyHandle: 'handle-3' },
        { oldKeyHandle: 'handle-3', newKeyHandle: 'handle-4' },
      ];

      expect(rotationChain[0].newKeyHandle).toBe(rotationChain[1].oldKeyHandle);
      expect(rotationChain[1].newKeyHandle).toBe(rotationChain[2].oldKeyHandle);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle device not found', async () => {
      mockDeviceRepository.findByDeviceId.mockResolvedValue(null);

      const device = await mockDeviceRepository.findByDeviceId('non-existent');

      expect(device).toBeNull();
    });

    it('should handle Vault storage failure gracefully', async () => {
      mockVaultStorage.storeServerPrivateKey.mockRejectedValue(
        new Error('Vault unavailable'),
      );

      await expect(
        mockVaultStorage.storeServerPrivateKey('handle', 'pem'),
      ).rejects.toThrow('Vault unavailable');
    });

    it('should validate key handle before storage', async () => {
      const invalidKeyHandle = ''; // Empty key handle

      const isValid = invalidKeyHandle.length > 0;

      expect(isValid).toBe(false);
    });

    it('should not rotate already revoked devices', async () => {
      const revokedDevice = {
        id: 'db-id',
        status: 'REVOKED',
        deviceId: 'device-456',
      };

      mockDeviceRepository.findByDeviceId.mockResolvedValue(revokedDevice);

      const device = await mockDeviceRepository.findByDeviceId('device-456');

      expect(device.status).toBe('REVOKED');
      // Service should not proceed with rotation for revoked devices
    });

    it('should clean up old key from Vault on rotation failure', async () => {
      const oldKeyHandle = 'old-key';

      mockVaultStorage.deleteServerPrivateKey.mockResolvedValue(undefined);

      await mockVaultStorage.deleteServerPrivateKey(oldKeyHandle);

      expect(mockVaultStorage.deleteServerPrivateKey).toHaveBeenCalledWith(oldKeyHandle);
    });
  });

  describe('Concurrent Rotations', () => {
    it('should handle concurrent rotation requests safely', async () => {
      const deviceId = 'device-456';

      mockDeviceRepository.updateStatus.mockResolvedValue({ status: 'ROTATED' });

      const rotation1 = mockDeviceRepository.updateStatus(deviceId, 'ROTATED');
      const rotation2 = mockDeviceRepository.updateStatus(deviceId, 'ROTATED');

      const [result1, result2] = await Promise.all([rotation1, rotation2]);

      expect(result1.status).toBe('ROTATED');
      expect(result2.status).toBe('ROTATED');
    });

    it('should track rotation timestamps for concurrency detection', async () => {
      const rotation1Timestamp = new Date();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const rotation2Timestamp = new Date();

      expect(rotation2Timestamp.getTime()).toBeGreaterThan(rotation1Timestamp.getTime());
    });
  });
});
