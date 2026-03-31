/**
 * Test Vectors: NFC Payment Crypto
 *
 * Generates and validates cross-platform test vectors for HKDF key derivation,
 * ephemeral key pairs, TLV encoding, and ECDSA signatures.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { HkdfKeyDerivationAdapter } from '../infrastructure/adapters/hkdf-key-derivation.adapter';
import { EcdsaSignatureAdapter } from '../infrastructure/adapters/ecdsa-signature.adapter';
import { TlvCodecAdapter } from '../infrastructure/adapters/tlv-codec.adapter';

const VECTORS_PATH = path.join(__dirname, 'nfc-payment-vectors.json');

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

  it('should generate test vectors for counters 0-10', () => {
    const sharedSecret = Buffer.from('aa'.repeat(16), 'hex');
    const salt = Buffer.from('bb'.repeat(16), 'hex');
    const rootSeed = hkdfAdapter.deriveRootSeed(sharedSecret, salt);

    const ephemeralKeys: any[] = [];

    for (let counter = 0; counter <= 10; counter++) {
      const { privateKey, publicKey } = hkdfAdapter.deriveEphemeralKeyPair(rootSeed, counter);

      // Export keys for the vector
      const privDer = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
      // Extract the 32-byte scalar from PKCS8 DER (last 32 bytes of the 67-byte structure)
      const privateKeyHex = privDer.subarray(privDer.length - 32).toString('hex');

      const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
      // Extract uncompressed point (65 bytes) from SPKI DER (after 26-byte header)
      const publicKeyHex = spkiDer.subarray(26).toString('hex');

      // Create a sample payload for this counter
      const samplePayload = tlvAdapter.encode([
        { tag: 0x01, value: Buffer.from('card-001') },
        { tag: 0x02, value: Buffer.from('1000') },
        { tag: 0x07, value: Buffer.from(counter.toString()) },
      ]);

      const signature = ecdsaAdapter.sign(samplePayload, privateKey);

      ephemeralKeys.push({
        counter,
        expected_private_key_hex: privateKeyHex,
        expected_public_key_hex: publicKeyHex,
        sample_payload_hex: samplePayload.toString('hex'),
        expected_signature_hex: signature.toString('hex'),
      });
    }

    const vectors = {
      description: 'NFC Payment crypto test vectors for cross-platform validation',
      hkdf: {
        hash: 'sha256',
        root_info: 'nfc-payment',
        key_info_prefix: 'nfc-payment-key:',
        output_length: 32,
      },
      root_seed_derivation: {
        shared_secret_hex: sharedSecret.toString('hex'),
        salt_hex: salt.toString('hex'),
        expected_root_seed_hex: rootSeed.toString('hex'),
      },
      ephemeral_keys: ephemeralKeys,
    };

    fs.writeFileSync(VECTORS_PATH, JSON.stringify(vectors, null, 2), 'utf-8');

    // Verify the file was written
    expect(fs.existsSync(VECTORS_PATH)).toBe(true);
    const written = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));
    expect(written.ephemeral_keys).toHaveLength(11);
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
});
