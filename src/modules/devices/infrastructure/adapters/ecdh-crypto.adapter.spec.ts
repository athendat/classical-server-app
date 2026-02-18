/**
 * Unit Tests: EcdhCryptoAdapter
 *
 * Tests for cryptographic operations:
 * - ECDH P-256 key pair generation
 * - Shared secret derivation
 * - HKDF-SHA256 key material derivation (RFC 5869)
 * - Public key validation
 * - Salt and key_handle generation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EcdhCryptoAdapter } from './ecdh-crypto.adapter';
import { DEVICE_KEY_CONSTANTS } from '../../domain/constants/device-key.constants';

describe('EcdhCryptoAdapter (Unit Tests)', () => {
  let adapter: EcdhCryptoAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EcdhCryptoAdapter],
    }).compile();

    adapter = module.get<EcdhCryptoAdapter>(EcdhCryptoAdapter);
  });

  describe('generateKeyPair', () => {
    it('should generate valid ECDH P-256 key pair', async () => {
      const keyPair = await adapter.generateKeyPair();

      // Verify private key format (PEM)
      expect(keyPair.privateKeyPem).toContain('-----BEGIN');
      expect(keyPair.privateKeyPem).toContain('-----END');
      expect(keyPair.privateKeyPem.length).toBeGreaterThan(200);

      // Verify public key format (Base64)
      expect(keyPair.publicKeyBase64).toBeTruthy();
      expect(keyPair.publicKeyBase64.length).toBe(88); // Base64 of 65 bytes
    });

    it('should generate unique key pairs', async () => {
      const pair1 = await adapter.generateKeyPair();
      const pair2 = await adapter.generateKeyPair();

      expect(pair1.privateKeyPem).not.toEqual(pair2.privateKeyPem);
      expect(pair1.publicKeyBase64).not.toEqual(pair2.publicKeyBase64);
    });

    it('public key should be uncompressed P-256 format (65 bytes)', async () => {
      const keyPair = await adapter.generateKeyPair();
      const publicKeyBuffer = Buffer.from(keyPair.publicKeyBase64, 'base64');

      // Uncompressed format: 0x04 prefix + 32 bytes X + 32 bytes Y = 65 bytes total
      expect(publicKeyBuffer.length).toBe(65);
      expect(publicKeyBuffer[0]).toBe(0x04); // Uncompressed format prefix
    });
  });

  describe('deriveSharedSecret', () => {
    it('should derive same shared secret from any device-server key pair', async () => {
      // Generate two key pairs
      const serverKeyPair = await adapter.generateKeyPair();
      const deviceKeyPair = await adapter.generateKeyPair();

      // Derive shared secrets both ways
      const secretAB = await adapter.deriveSharedSecret(
        deviceKeyPair.publicKeyBase64,
        serverKeyPair.privateKeyPem,
      );

      const secretBA = await adapter.deriveSharedSecret(
        serverKeyPair.publicKeyBase64,
        deviceKeyPair.privateKeyPem,
      );

      // ECDH property: both should derive the same secret
      expect(secretAB).toEqual(secretBA);
      expect(secretAB.length).toBe(32); // P-256 produces 32-byte secrets
    });

    it('should reject invalid device public key format', async () => {
      const serverKeyPair = await adapter.generateKeyPair();

      await expect(
        adapter.deriveSharedSecret('invalid-base64!!!', serverKeyPair.privateKeyPem),
      ).rejects.toThrow();
    });

    it('should reject invalid server private key', async () => {
      const deviceKeyPair = await adapter.generateKeyPair();

      await expect(
        adapter.deriveSharedSecret(
          deviceKeyPair.publicKeyBase64,
          'not-a-valid-pem-key',
        ),
      ).rejects.toThrow();
    });
  });

  describe('deriveHkdf', () => {
    it('should derive HKDF-SHA256 key material (RFC 5869)', async () => {
      const sharedSecret = Buffer.from('shared-secret-32-bytes-long-here');
      const salt = Buffer.from('salt-32-bytes-here-for-hkdf');
      const info = DEVICE_KEY_CONSTANTS.HKDF_INFO;

      const hkdf = await adapter.deriveHkdf(sharedSecret, salt, info);

      expect(hkdf).toBeInstanceOf(Buffer);
      expect(hkdf.length).toBe(DEVICE_KEY_CONSTANTS.HKDF_OUTPUT_LENGTH);
    });

    it('should produce deterministic output for same inputs', async () => {
      const sharedSecret = Buffer.from('shared-secret-32-bytes-long-here');
      const salt = Buffer.from('salt-32-bytes-here-for-hkdf');
      const info = 'test-info';

      const hkdf1 = await adapter.deriveHkdf(sharedSecret, salt, info);
      const hkdf2 = await adapter.deriveHkdf(sharedSecret, salt, info);

      expect(hkdf1).toEqual(hkdf2);
    });

    it('should produce different output for different inputs', async () => {
      const sharedSecret1 = Buffer.from('secret-1-32-bytes-long-padding!!');
      const sharedSecret2 = Buffer.from('secret-2-32-bytes-long-padding!!');
      const salt = Buffer.from('salt-32-bytes-here-for-hkdf');
      const info = 'test-info';

      const hkdf1 = await adapter.deriveHkdf(sharedSecret1, salt, info);
      const hkdf2 = await adapter.deriveHkdf(sharedSecret2, salt, info);

      expect(hkdf1).not.toEqual(hkdf2);
    });
  });

  describe('validatePublicKey', () => {
    it('should accept valid uncompressed P-256 public key', async () => {
      const keyPair = await adapter.generateKeyPair();

      const validation = await adapter.validatePublicKey(keyPair.publicKeyBase64);

      expect(validation.isValid).toBe(true);
    });

    it('should reject invalid Base64', async () => {
      const validation = await adapter.validatePublicKey('not-valid-base64!!!');

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toBeTruthy();
    });

    it('should reject wrong key length', async () => {
      // Generate a 64-byte Base64 instead of 88 (65 bytes)
      const shortKey = Buffer.alloc(32).toString('base64');

      const validation = await adapter.validatePublicKey(shortKey);

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('length');
    });

    it('should reject non-uncompressed format (wrong prefix)', async () => {
      // Create 65-byte buffer but with wrong prefix
      const fakeKey = Buffer.alloc(65);
      fakeKey[0] = 0x03; // Compressed format prefix instead of 0x04

      const validation = await adapter.validatePublicKey(fakeKey.toString('base64'));

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('format');
    });
  });

  describe('generateSalt', () => {
    it('should generate cryptographically secure salt', async () => {
      const salt = await adapter.generateSalt(32);

      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });

    it('should generate unique salts', async () => {
      const salt1 = await adapter.generateSalt(32);
      const salt2 = await adapter.generateSalt(32);

      expect(salt1).not.toEqual(salt2);
    });

    it('should respect requested length', async () => {
      const lengths = [16, 32, 64];

      for (const length of lengths) {
        const salt = await adapter.generateSalt(length);
        expect(salt.length).toBe(length);
      }
    });
  });

  describe('generateKeyHandle', () => {
    it('should generate opaque key_handle identifier', async () => {
      const keyHandle = await adapter.generateKeyHandle(32);

      expect(typeof keyHandle).toBe('string');
      expect(keyHandle.length).toBeGreaterThan(20); // Base64url encoded
    });

    it('should generate unique key_handles', async () => {
      const handle1 = await adapter.generateKeyHandle(32);
      const handle2 = await adapter.generateKeyHandle(32);

      expect(handle1).not.toEqual(handle2);
    });

    it('should respect requested length', async () => {
      const handle = await adapter.generateKeyHandle(16);

      // 16 bytes in base64url ≈ 21-24 characters
      expect(handle.length).toBeLessThan(30);
    });

    it('should generate valid base64url characters', async () => {
      const keyHandle = await adapter.generateKeyHandle(32);

      // Base64url only allows alphanumeric, -, _
      expect(/^[A-Za-z0-9_-]+$/.test(keyHandle)).toBe(true);
    });
  });

  describe('Integration: Full ECDH flow', () => {
    it('should complete full key exchange workflow', async () => {
      // 1. Server generates key pair
      const serverKeyPair = await adapter.generateKeyPair();
      expect(serverKeyPair.publicKeyBase64.length).toBe(88);

      // 2. Device generates key pair and sends public key
      const deviceKeyPair = await adapter.generateKeyPair();
      const devicePublicKey = deviceKeyPair.publicKeyBase64;

      // 3. Validate device public key
      const validation = await adapter.validatePublicKey(devicePublicKey);
      expect(validation.isValid).toBe(true);

      // 4. Derive shared secret
      const sharedSecret = await adapter.deriveSharedSecret(
        devicePublicKey,
        serverKeyPair.privateKeyPem,
      );
      expect(sharedSecret.length).toBe(32);

      // 5. Generate salt
      const salt = await adapter.generateSalt(DEVICE_KEY_CONSTANTS.SALT_LENGTH_BYTES);
      expect(salt.length).toBe(32);

      // 6. Generate key_handle
      const keyHandle = await adapter.generateKeyHandle(DEVICE_KEY_CONSTANTS.KEY_HANDLE_LENGTH);
      expect(keyHandle).toBeTruthy();

      // 7. Derive master key material using HKDF
      const masterKey = await adapter.deriveHkdf(
        sharedSecret,
        salt,
        DEVICE_KEY_CONSTANTS.HKDF_INFO,
      );
      expect(masterKey.length).toBe(DEVICE_KEY_CONSTANTS.HKDF_OUTPUT_LENGTH);

      // All components should be present and valid
      expect(serverKeyPair.privateKeyPem).toContain('-----BEGIN');
      expect(devicePublicKey.length).toBe(88);
      expect(sharedSecret.length).toBe(32);
      expect(salt.length).toBe(32);
      expect(keyHandle.length).toBeGreaterThan(0);
      expect(masterKey.length).toBeGreaterThan(0);
    });
  });
});
