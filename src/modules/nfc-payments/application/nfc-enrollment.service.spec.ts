/**
 * Unit Tests: NfcEnrollmentService
 *
 * Tests for NFC card enrollment flow:
 * - Key pair generation and shared secret derivation
 * - Root seed storage in Vault
 * - Enrollment record persistence
 * - Re-enrollment (revoke old, create new)
 * - Public key validation
 * - Revocation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { NfcEnrollmentService } from './nfc-enrollment.service';
import {
  NFC_ENROLLMENT_INJECTION_TOKENS,
  NFC_PAYMENT_INJECTION_TOKENS,
} from '../domain/constants/nfc-payment.constants';

import type { INfcEnrollmentRepository, NfcEnrollmentEntity } from '../domain/ports/nfc-enrollment-repository.port';
import type { IHkdfKeyDerivationPort } from '../domain/ports/hkdf-key-derivation.port';
import { EcdhCryptoAdapter } from '../../devices/infrastructure/adapters/ecdh-crypto.adapter';
import { VaultHttpAdapter } from '../../vault/infrastructure/adapters/vault-http.adapter';
import { Result } from 'src/common/types/result.type';

describe('NfcEnrollmentService (Unit Tests)', () => {
  let service: NfcEnrollmentService;
  let mockEnrollmentRepository: jest.Mocked<INfcEnrollmentRepository>;
  let mockHkdfService: jest.Mocked<IHkdfKeyDerivationPort>;
  let mockEcdhCrypto: Partial<EcdhCryptoAdapter>;
  let mockVaultClient: Partial<VaultHttpAdapter>;

  // A valid 65-byte uncompressed P-256 public key (0x04 prefix + 64 random bytes) in Base64
  const validDevicePublicKeyBase64 = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.alloc(64, 0xab),
  ]).toString('base64');

  const serverKeyPair = {
    privateKeyPem: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----',
    publicKeyBase64: Buffer.concat([
      Buffer.from([0x04]),
      Buffer.alloc(64, 0xcd),
    ]).toString('base64'),
  };

  const sharedSecret = Buffer.alloc(32, 0x01);
  const rootSeed = Buffer.alloc(32, 0x02);

  beforeEach(async () => {
    mockEnrollmentRepository = {
      findByCardId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) =>
        Promise.resolve({ id: 'enrollment-id', ...data } as NfcEnrollmentEntity),
      ),
      update: jest.fn().mockResolvedValue(null),
      incrementCounter: jest.fn().mockResolvedValue(1),
    };

    mockHkdfService = {
      deriveRootSeed: jest.fn().mockReturnValue(rootSeed),
      deriveEphemeralKeyPair: jest.fn(),
    };

    mockEcdhCrypto = {
      generateKeyPair: jest.fn().mockResolvedValue(serverKeyPair),
      deriveSharedSecret: jest.fn().mockResolvedValue(sharedSecret),
      generateSalt: jest.fn().mockResolvedValue(Buffer.alloc(32, 0x03)),
    };

    mockVaultClient = {
      writeKV: jest.fn().mockResolvedValue(Result.ok({})),
      deleteKV: jest.fn().mockResolvedValue(Result.ok()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfcEnrollmentService,
        {
          provide: NFC_ENROLLMENT_INJECTION_TOKENS.NFC_ENROLLMENT_REPOSITORY,
          useValue: mockEnrollmentRepository,
        },
        {
          provide: NFC_PAYMENT_INJECTION_TOKENS.HKDF_KEY_DERIVATION_PORT,
          useValue: mockHkdfService,
        },
        {
          provide: EcdhCryptoAdapter,
          useValue: mockEcdhCrypto,
        },
        {
          provide: VaultHttpAdapter,
          useValue: mockVaultClient,
        },
      ],
    }).compile();

    service = module.get<NfcEnrollmentService>(NfcEnrollmentService);
  });

  describe('enrollCard', () => {
    it('should generate server key pair and derive root seed', async () => {
      const result = await service.enrollCard('user-1', 'card-1', validDevicePublicKeyBase64);

      expect(mockEcdhCrypto.generateKeyPair).toHaveBeenCalled();
      expect(mockEcdhCrypto.deriveSharedSecret).toHaveBeenCalledWith(
        validDevicePublicKeyBase64,
        serverKeyPair.privateKeyPem,
      );
      expect(mockHkdfService.deriveRootSeed).toHaveBeenCalledWith(
        sharedSecret,
        expect.any(Buffer),
      );
      expect(result.serverPublicKey).toBe(serverKeyPair.publicKeyBase64);
      expect(result.counter).toBe(0);
    });

    it('should store root seed in Vault at correct path', async () => {
      await service.enrollCard('user-1', 'card-42', validDevicePublicKeyBase64);

      expect(mockVaultClient.writeKV).toHaveBeenCalledWith(
        'nfc-enrollments/card-42/root-seed',
        expect.objectContaining({
          rootSeed: rootSeed.toString('base64'),
        }),
      );
    });

    it('should create enrollment record with counter=0', async () => {
      await service.enrollCard('user-1', 'card-1', validDevicePublicKeyBase64);

      expect(mockEnrollmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 'card-1',
          userId: 'user-1',
          devicePublicKey: validDevicePublicKeyBase64,
          serverPublicKey: serverKeyPair.publicKeyBase64,
          vaultKeyPath: 'nfc-enrollments/card-1/root-seed',
          counter: 0,
          status: 'active',
        }),
      );
    });

    it('should revoke existing enrollment before creating new one', async () => {
      const existingEnrollment: NfcEnrollmentEntity = {
        id: 'old-enrollment-id',
        cardId: 'card-1',
        userId: 'user-1',
        devicePublicKey: 'old-key',
        serverPublicKey: 'old-server-key',
        vaultKeyPath: 'nfc-enrollments/card-1/root-seed',
        counter: 5,
        status: 'active',
      };

      mockEnrollmentRepository.findByCardId.mockResolvedValueOnce(existingEnrollment);

      await service.enrollCard('user-1', 'card-1', validDevicePublicKeyBase64);

      // Verify old Vault key deleted
      expect(mockVaultClient.deleteKV).toHaveBeenCalledWith('nfc-enrollments/card-1/root-seed');

      // Verify old enrollment updated to revoked
      expect(mockEnrollmentRepository.update).toHaveBeenCalledWith(
        'card-1',
        expect.objectContaining({
          status: 'revoked',
          revokedAt: expect.any(Date),
        }),
      );

      // Verify new enrollment created
      expect(mockEnrollmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 'card-1',
          counter: 0,
          status: 'active',
        }),
      );
    });

    it('should reject invalid public key (wrong length)', async () => {
      const invalidKey = Buffer.alloc(32, 0x04).toString('base64'); // 32 bytes, not 65

      await expect(
        service.enrollCard('user-1', 'card-1', invalidKey),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeEnrollment', () => {
    it('should delete root seed from Vault and mark as revoked', async () => {
      const existingEnrollment: NfcEnrollmentEntity = {
        id: 'enrollment-id',
        cardId: 'card-1',
        userId: 'user-1',
        devicePublicKey: 'some-key',
        serverPublicKey: 'some-server-key',
        vaultKeyPath: 'nfc-enrollments/card-1/root-seed',
        counter: 3,
        status: 'active',
      };

      mockEnrollmentRepository.findByCardId.mockResolvedValueOnce(existingEnrollment);

      await service.revokeEnrollment('card-1', 'user-1');

      expect(mockVaultClient.deleteKV).toHaveBeenCalledWith('nfc-enrollments/card-1/root-seed');
      expect(mockEnrollmentRepository.update).toHaveBeenCalledWith(
        'card-1',
        expect.objectContaining({
          status: 'revoked',
          revokedAt: expect.any(Date),
        }),
      );
    });

    it('should fail if userId does not match', async () => {
      const existingEnrollment: NfcEnrollmentEntity = {
        id: 'enrollment-id',
        cardId: 'card-1',
        userId: 'user-A',
        devicePublicKey: 'some-key',
        serverPublicKey: 'some-server-key',
        vaultKeyPath: 'nfc-enrollments/card-1/root-seed',
        counter: 3,
        status: 'active',
      };

      mockEnrollmentRepository.findByCardId.mockResolvedValueOnce(existingEnrollment);

      await expect(
        service.revokeEnrollment('card-1', 'user-B'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getEnrollment', () => {
    it('should return enrollment for valid cardId', async () => {
      const enrollment: NfcEnrollmentEntity = {
        id: 'enrollment-id',
        cardId: 'card-1',
        userId: 'user-1',
        devicePublicKey: 'some-key',
        serverPublicKey: 'some-server-key',
        vaultKeyPath: 'nfc-enrollments/card-1/root-seed',
        counter: 0,
        status: 'active',
      };

      mockEnrollmentRepository.findByCardId.mockResolvedValueOnce(enrollment);

      const result = await service.getEnrollment('card-1');

      expect(result).toEqual(enrollment);
      expect(mockEnrollmentRepository.findByCardId).toHaveBeenCalledWith('card-1');
    });
  });
});
