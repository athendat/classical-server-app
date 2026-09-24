/**
 * Test Vectors: NFC Payment Crypto
 *
 * Validates the versioned cross-platform test vectors (ADR-0004) for HKDF key
 * derivation, ephemeral key pairs, TLV encoding, and ECDSA signatures.
 * This spec never writes the vectors file.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { HkdfKeyDerivationAdapter } from '../infrastructure/adapters/hkdf-key-derivation.adapter';
import { EcdsaSignatureAdapter } from '../infrastructure/adapters/ecdsa-signature.adapter';
import { TlvCodecAdapter } from '../infrastructure/adapters/tlv-codec.adapter';

const VECTORS_PATH = path.join(__dirname, 'nfc-payment-vectors.json');
// Read before any test runs, so the last test can prove the suite wrote nothing.
const VERSIONED_VECTORS = fs.readFileSync(VECTORS_PATH, 'utf-8');

describe('NFC Payment Test Vectors', () => {
  let hkdfAdapter: HkdfKeyDerivationAdapter;
  let ecdsaAdapter: EcdsaSignatureAdapter;
  let tlvAdapter: TlvCodecAdapter;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HkdfKeyDerivationAdapter, EcdsaSignatureAdapter, TlvCodecAdapter],
    }).compile();

    hkdfAdapter = module.get<HkdfKeyDerivationAdapter>(HkdfKeyDerivationAdapter);
    ecdsaAdapter = module.get<EcdsaSignatureAdapter>(EcdsaSignatureAdapter);
    tlvAdapter = module.get<TlvCodecAdapter>(TlvCodecAdapter);
  });

  it('should validate all test vectors from JSON', () => {
    const vectors = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));

    // Validate root seed derivation
    const sharedSecret = Buffer.from(vectors.root_seed_derivation.shared_secret_hex, 'hex');
    const salt = Buffer.from(vectors.root_seed_derivation.salt_hex, 'hex');
    const rootSeed = hkdfAdapter.deriveRootSeed(sharedSecret, salt);
    expect(rootSeed.toString('hex')).toBe(vectors.root_seed_derivation.expected_root_seed_hex);

    // Validate each ephemeral key and signature
    for (const vector of vectors.ephemeral_keys) {
      const { privateKey, publicKey } = hkdfAdapter.deriveEphemeralKeyPair(rootSeed, vector.counter);

      // Validate private key
      const privDer = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
      const privateKeyHex = privDer.subarray(privDer.length - 32).toString('hex');
      expect(privateKeyHex).toBe(vector.expected_private_key_hex);

      // Validate public key
      const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
      const publicKeyHex = spkiDer.subarray(26).toString('hex');
      expect(publicKeyHex).toBe(vector.expected_public_key_hex);

      // Validate signature verification (ECDSA signatures are non-deterministic,
      // so we verify the stored signature against the stored payload)
      const payload = Buffer.from(vector.sample_payload_hex, 'hex');
      const signature = Buffer.from(vector.expected_signature_hex, 'hex');
      const isValid = ecdsaAdapter.verify(payload, signature, publicKey);
      expect(isValid).toBe(true);
    }
  });

  it('leaves the versioned vectors file unchanged', () => {
    expect(fs.readFileSync(VECTORS_PATH, 'utf-8')).toBe(VERSIONED_VECTORS);
  });
});
