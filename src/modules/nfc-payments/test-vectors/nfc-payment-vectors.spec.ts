/**
 * Test Vectors: NFC Payment Crypto
 *
 * Validates the versioned cross-platform test vectors (ADR-0004) for HKDF key
 * derivation, ephemeral key pairs, TLV encoding, and ECDSA signatures.
 * This spec never writes the vectors file.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  NfcPaymentVectors,
  generateNfcPaymentVectors,
  validateNfcPaymentVectors,
  writeNfcPaymentVectors,
} from './nfc-payment-vectors.tool';

const VECTORS_PATH = path.join(__dirname, 'nfc-payment-vectors.json');
// Read before any test runs, so the last test can prove the suite wrote nothing.
const VERSIONED_VECTORS = fs.readFileSync(VECTORS_PATH, 'utf-8');

const versionedVectors = (): NfcPaymentVectors =>
  JSON.parse(VERSIONED_VECTORS) as NfcPaymentVectors;

/** Flips the last byte of a hex string, so the value stays well-formed. */
const flipLastByte = (hex: string): string =>
  hex.slice(0, -2) + (parseInt(hex.slice(-2), 16) ^ 0x01).toString(16).padStart(2, '0');

/**
 * Vectors text with line endings normalized and the randomized ECDSA
 * signatures masked, so two generations can be compared byte for byte.
 */
const withoutSignatures = (json: string): string =>
  json
    .replace(/\r\n/g, '\n')
    .replace(/"expected_signature_hex": "[0-9a-f]+"/g, '"expected_signature_hex": "<signature>"');

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
    ['hash', 'sha512'],
    ['root_info', 'nfc-payment-v2'],
    ['key_info_prefix', 'nfc-payment-key-v2:'],
    ['output_length', 64],
  ] as const)('fails when the hkdf parameter %s disagrees with the server', (field, value) => {
    const vectors = versionedVectors();
    (vectors.hkdf as Record<string, string | number>)[field] = value;

    expect(validateNfcPaymentVectors(vectors)).toEqual([`hkdf.${field}`]);
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

  it('generates vectors that pass validation', () => {
    expect(validateNfcPaymentVectors(generateNfcPaymentVectors())).toEqual([]);
  });

  it('writes the vectors in the versioned format, differing only in signatures', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-vectors-'));
    const outPath = path.join(dir, 'nfc-payment-vectors.json');
    try {
      writeNfcPaymentVectors(outPath);
      const written = fs.readFileSync(outPath, 'utf-8');

      expect(validateNfcPaymentVectors(JSON.parse(written))).toEqual([]);
      expect(withoutSignatures(written)).toBe(withoutSignatures(VERSIONED_VECTORS));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to write vectors that fail validation, leaving the target untouched', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfc-vectors-'));
    const outPath = path.join(dir, 'nfc-payment-vectors.json');
    const invalidGeneration = (): NfcPaymentVectors => {
      const vectors = versionedVectors();
      vectors.ephemeral_keys[3].expected_public_key_hex = flipLastByte(
        vectors.ephemeral_keys[3].expected_public_key_hex,
      );
      return vectors;
    };
    try {
      fs.writeFileSync(outPath, VERSIONED_VECTORS, 'utf-8');

      expect(() => writeNfcPaymentVectors(outPath, invalidGeneration)).toThrow(
        'ephemeral_keys[3].expected_public_key_hex',
      );
      expect(fs.readFileSync(outPath, 'utf-8')).toBe(VERSIONED_VECTORS);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves the versioned vectors file unchanged', () => {
    expect(fs.readFileSync(VECTORS_PATH, 'utf-8')).toBe(VERSIONED_VECTORS);
  });
});
