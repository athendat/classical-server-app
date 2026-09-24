/**
 * Test Vectors: NFC Payment Crypto
 *
 * Validates the versioned cross-platform test vectors (ADR-0004) for HKDF key
 * derivation, ephemeral key pairs, TLV encoding, and ECDSA signatures.
 * This spec never writes the vectors file.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  NfcPaymentVectors,
  validateNfcPaymentVectors,
} from './nfc-payment-vectors.tool';

const VECTORS_PATH = path.join(__dirname, 'nfc-payment-vectors.json');
// Read before any test runs, so the last test can prove the suite wrote nothing.
const VERSIONED_VECTORS = fs.readFileSync(VECTORS_PATH, 'utf-8');

const versionedVectors = (): NfcPaymentVectors =>
  JSON.parse(VERSIONED_VECTORS) as NfcPaymentVectors;

/** Flips the last byte of a hex string, so the value stays well-formed. */
const flipLastByte = (hex: string): string =>
  hex.slice(0, -2) + (parseInt(hex.slice(-2), 16) ^ 0x01).toString(16).padStart(2, '0');

describe('NFC Payment Test Vectors', () => {
  it('validates the versioned vectors: root seed, Counter keys, TLV payload and signature', () => {
    const vectors = versionedVectors();

    expect(vectors.ephemeral_keys).toHaveLength(11);
    expect(validateNfcPaymentVectors(vectors)).toEqual([]);
  });

  it('fails when the versioned root seed is altered', () => {
    const vectors = versionedVectors();
    vectors.root_seed_derivation.expected_root_seed_hex = flipLastByte(
      vectors.root_seed_derivation.expected_root_seed_hex,
    );

    expect(validateNfcPaymentVectors(vectors)).toContain(
      'root_seed_derivation.expected_root_seed_hex',
    );
  });

  it.each([
    'expected_private_key_hex',
    'expected_public_key_hex',
    'sample_payload_hex',
    'expected_signature_hex',
  ] as const)('fails when a Counter vector %s is altered', (field) => {
    const vectors = versionedVectors();
    vectors.ephemeral_keys[3][field] = flipLastByte(vectors.ephemeral_keys[3][field]);

    expect(validateNfcPaymentVectors(vectors)).toContain(`ephemeral_keys[3].${field}`);
  });

  it('leaves the versioned vectors file unchanged', () => {
    expect(fs.readFileSync(VECTORS_PATH, 'utf-8')).toBe(VERSIONED_VECTORS);
  });
});
