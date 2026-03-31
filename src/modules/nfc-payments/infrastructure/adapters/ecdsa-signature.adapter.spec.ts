/**
 * Unit Tests: EcdsaSignatureAdapter
 *
 * Tests for ECDSA signature and verification operations with EC P-256 keys.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EcdsaSignatureAdapter } from './ecdsa-signature.adapter';
import { HkdfKeyDerivationAdapter } from './hkdf-key-derivation.adapter';
import { TlvCodecAdapter } from './tlv-codec.adapter';

describe('EcdsaSignatureAdapter (Unit Tests)', () => {
  let signatureAdapter: EcdsaSignatureAdapter;
  let hkdfAdapter: HkdfKeyDerivationAdapter;
  let tlvAdapter: TlvCodecAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EcdsaSignatureAdapter, HkdfKeyDerivationAdapter, TlvCodecAdapter],
    }).compile();

    signatureAdapter = module.get<EcdsaSignatureAdapter>(EcdsaSignatureAdapter);
    hkdfAdapter = module.get<HkdfKeyDerivationAdapter>(HkdfKeyDerivationAdapter);
    tlvAdapter = module.get<TlvCodecAdapter>(TlvCodecAdapter);
  });

  describe('sign and verify', () => {
    it('should sign and verify a payload successfully', () => {
      const rootSeed = Buffer.from('dd'.repeat(16), 'hex');
      const { privateKey, publicKey } = hkdfAdapter.deriveEphemeralKeyPair(rootSeed, 0);

      const payload = tlvAdapter.encode([
        { tag: 0x01, value: Buffer.from('card-001') },
        { tag: 0x02, value: Buffer.from('5000') },
      ]);

      const signature = signatureAdapter.sign(payload, privateKey);
      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBeGreaterThan(0);

      const isValid = signatureAdapter.verify(payload, signature, publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject a tampered payload', () => {
      const rootSeed = Buffer.from('dd'.repeat(16), 'hex');
      const { privateKey, publicKey } = hkdfAdapter.deriveEphemeralKeyPair(rootSeed, 0);

      const payload = tlvAdapter.encode([
        { tag: 0x01, value: Buffer.from('card-001') },
        { tag: 0x02, value: Buffer.from('5000') },
      ]);

      const signature = signatureAdapter.sign(payload, privateKey);

      // Tamper with the payload
      const tampered = Buffer.from(payload);
      tampered[tampered.length - 1] ^= 0xff;

      const isValid = signatureAdapter.verify(tampered, signature, publicKey);
      expect(isValid).toBe(false);
    });

    it('should reject a signature with wrong public key', () => {
      const rootSeed = Buffer.from('dd'.repeat(16), 'hex');
      const { privateKey } = hkdfAdapter.deriveEphemeralKeyPair(rootSeed, 0);
      const { publicKey: wrongPublicKey } = hkdfAdapter.deriveEphemeralKeyPair(rootSeed, 1);

      const payload = tlvAdapter.encode([
        { tag: 0x01, value: Buffer.from('card-001') },
        { tag: 0x02, value: Buffer.from('5000') },
      ]);

      const signature = signatureAdapter.sign(payload, privateKey);

      const isValid = signatureAdapter.verify(payload, signature, wrongPublicKey);
      expect(isValid).toBe(false);
    });
  });
});
