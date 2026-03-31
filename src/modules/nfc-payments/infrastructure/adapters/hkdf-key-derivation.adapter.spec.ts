/**
 * Unit Tests: HkdfKeyDerivationAdapter
 *
 * Tests for HKDF-SHA256 root seed derivation and ephemeral EC P-256 key pair generation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { HkdfKeyDerivationAdapter } from './hkdf-key-derivation.adapter';

describe('HkdfKeyDerivationAdapter (Unit Tests)', () => {
  let adapter: HkdfKeyDerivationAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HkdfKeyDerivationAdapter],
    }).compile();

    adapter = module.get<HkdfKeyDerivationAdapter>(HkdfKeyDerivationAdapter);
  });

  describe('deriveRootSeed', () => {
    it('should derive a 32-byte root seed from shared secret and salt', () => {
      const sharedSecret = Buffer.from('aa'.repeat(16), 'hex'); // 32 bytes
      const salt = Buffer.from('bb'.repeat(16), 'hex'); // 32 bytes

      const result = adapter.deriveRootSeed(sharedSecret, salt);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);

      // Deterministic: calling twice with same inputs should return same result
      const result2 = adapter.deriveRootSeed(sharedSecret, salt);
      expect(result).toEqual(result2);
    });
  });

  describe('deriveEphemeralKeyPair', () => {
    it('should derive a valid EC P-256 key pair from root seed and counter', () => {
      const rootSeed = Buffer.from('cc'.repeat(16), 'hex'); // 32 bytes
      const result = adapter.deriveEphemeralKeyPair(rootSeed, 0);

      expect(result.privateKey).toBeInstanceOf(crypto.KeyObject);
      expect(result.publicKey).toBeInstanceOf(crypto.KeyObject);
      expect(result.privateKey.type).toBe('private');
      expect(result.publicKey.type).toBe('public');
    });

    it('should derive same key pair for same root seed and counter (deterministic)', () => {
      const rootSeed = Buffer.from('cc'.repeat(16), 'hex');

      const result1 = adapter.deriveEphemeralKeyPair(rootSeed, 0);
      const result2 = adapter.deriveEphemeralKeyPair(rootSeed, 0);

      const pub1 = result1.publicKey.export({ format: 'der', type: 'spki' });
      const pub2 = result2.publicKey.export({ format: 'der', type: 'spki' });
      expect(pub1).toEqual(pub2);
    });

    it('should derive different key pairs for different counters', () => {
      const rootSeed = Buffer.from('cc'.repeat(16), 'hex');

      const result0 = adapter.deriveEphemeralKeyPair(rootSeed, 0);
      const result1 = adapter.deriveEphemeralKeyPair(rootSeed, 1);

      const pub0 = result0.publicKey.export({ format: 'der', type: 'spki' });
      const pub1 = result1.publicKey.export({ format: 'der', type: 'spki' });
      expect(pub0).not.toEqual(pub1);
    });
  });
});
