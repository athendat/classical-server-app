/**
 * NFC Payment test vectors (ADR-0004).
 *
 * Generation and validation of the cross-platform vectors. The spec validates
 * the versioned nfc-payment-vectors.json; `yarn vectors:nfc` regenerates it.
 * Both use the production adapters, so the vectors lock the same bytes the
 * server derives.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

import { HkdfKeyDerivationAdapter } from '../infrastructure/adapters/hkdf-key-derivation.adapter';
import { EcdsaSignatureAdapter } from '../infrastructure/adapters/ecdsa-signature.adapter';
import { TlvCodecAdapter } from '../infrastructure/adapters/tlv-codec.adapter';
import {
  NFC_PAYMENT_CONSTANTS,
  NFC_TLV_TAGS,
} from '../domain/constants/nfc-payment.constants';

export interface NfcPaymentCounterVector {
  counter: number;
  expected_private_key_hex: string;
  expected_public_key_hex: string;
  sample_payload_hex: string;
  expected_signature_hex: string;
}

export interface NfcPaymentVectors {
  description: string;
  hkdf: {
    hash: string;
    root_info: string;
    key_info_prefix: string;
    output_length: number;
  };
  root_seed_derivation: {
    shared_secret_hex: string;
    salt_hex: string;
    expected_root_seed_hex: string;
  };
  ephemeral_keys: NfcPaymentCounterVector[];
}

/** Fixed ECDH shared secret and salt the vectors derive their Root seed from. */
const SHARED_SECRET_HEX = 'aa'.repeat(16);
const SALT_HEX = 'bb'.repeat(16);
/** Counters covered by the vectors. */
const FIRST_COUNTER = 0;
const LAST_COUNTER = 10;

const hkdf = new HkdfKeyDerivationAdapter();
const ecdsa = new EcdsaSignatureAdapter();
const tlv = new TlvCodecAdapter();

/** The 32-byte private scalar: the tail of the PKCS8 DER. */
const privateKeyHex = (privateKey: crypto.KeyObject): string => {
  const der = privateKey.export({ format: 'der', type: 'pkcs8' });
  return der.subarray(der.length - 32).toString('hex');
};

/** The 65-byte uncompressed point: the SPKI DER after its 26-byte header. */
const publicKeyHex = (publicKey: crypto.KeyObject): string =>
  publicKey.export({ format: 'der', type: 'spki' }).subarray(26).toString('hex');

/** The sample TLV payload signed for a Counter. */
const samplePayload = (counter: number): Buffer =>
  tlv.encode([
    { tag: NFC_TLV_TAGS.CARD_ID, value: Buffer.from('card-001') },
    { tag: NFC_TLV_TAGS.AMOUNT, value: Buffer.from('1000') },
    { tag: NFC_TLV_TAGS.COUNTER, value: Buffer.from(counter.toString()) },
  ]);

/**
 * Checks vectors against the adapters. Returns the path of every field that
 * does not match; an empty list means the vectors are valid.
 *
 * Root seed, Counter keys and TLV payload are deterministic and compared
 * exactly. ECDSA signatures are randomized, so the stored signature is
 * verified against the stored payload and the derived public key.
 */
export function validateNfcPaymentVectors(vectors: NfcPaymentVectors): string[] {
  const mismatches: string[] = [];
  const seed = vectors.root_seed_derivation;

  const rootSeed = hkdf.deriveRootSeed(
    Buffer.from(seed.shared_secret_hex, 'hex'),
    Buffer.from(seed.salt_hex, 'hex'),
  );
  if (rootSeed.toString('hex') !== seed.expected_root_seed_hex) {
    mismatches.push('root_seed_derivation.expected_root_seed_hex');
  }

  vectors.ephemeral_keys.forEach((vector, i) => {
    const at = (field: keyof NfcPaymentCounterVector) => `ephemeral_keys[${i}].${field}`;
    const { privateKey, publicKey } = hkdf.deriveEphemeralKeyPair(rootSeed, vector.counter);

    if (privateKeyHex(privateKey) !== vector.expected_private_key_hex) {
      mismatches.push(at('expected_private_key_hex'));
    }
    if (publicKeyHex(publicKey) !== vector.expected_public_key_hex) {
      mismatches.push(at('expected_public_key_hex'));
    }
    if (samplePayload(vector.counter).toString('hex') !== vector.sample_payload_hex) {
      mismatches.push(at('sample_payload_hex'));
    }
    const signatureValid = ecdsa.verify(
      Buffer.from(vector.sample_payload_hex, 'hex'),
      Buffer.from(vector.expected_signature_hex, 'hex'),
      publicKey,
    );
    if (!signatureValid) {
      mismatches.push(at('expected_signature_hex'));
    }
  });

  return mismatches;
}

/**
 * Builds the vectors: the Root seed from the fixed shared secret and salt,
 * then, per Counter, its key pair, a sample TLV payload and a fresh signature.
 */
export function generateNfcPaymentVectors(): NfcPaymentVectors {
  const rootSeed = hkdf.deriveRootSeed(
    Buffer.from(SHARED_SECRET_HEX, 'hex'),
    Buffer.from(SALT_HEX, 'hex'),
  );

  const ephemeralKeys: NfcPaymentCounterVector[] = [];
  for (let counter = FIRST_COUNTER; counter <= LAST_COUNTER; counter++) {
    const { privateKey, publicKey } = hkdf.deriveEphemeralKeyPair(rootSeed, counter);
    const payload = samplePayload(counter);

    ephemeralKeys.push({
      counter,
      expected_private_key_hex: privateKeyHex(privateKey),
      expected_public_key_hex: publicKeyHex(publicKey),
      sample_payload_hex: payload.toString('hex'),
      expected_signature_hex: ecdsa.sign(payload, privateKey).toString('hex'),
    });
  }

  return {
    description: 'NFC Payment crypto test vectors for cross-platform validation',
    hkdf: {
      hash: NFC_PAYMENT_CONSTANTS.HKDF_HASH,
      root_info: NFC_PAYMENT_CONSTANTS.HKDF_ROOT_INFO,
      key_info_prefix: NFC_PAYMENT_CONSTANTS.HKDF_KEY_INFO_PREFIX,
      output_length: NFC_PAYMENT_CONSTANTS.HKDF_OUTPUT_LENGTH,
    },
    root_seed_derivation: {
      shared_secret_hex: SHARED_SECRET_HEX,
      salt_hex: SALT_HEX,
      expected_root_seed_hex: rootSeed.toString('hex'),
    },
    ephemeral_keys: ephemeralKeys,
  };
}

/**
 * Generates fresh vectors, validates them in memory and only then writes
 * them as pretty-printed JSON. Invalid vectors throw and leave `outPath`
 * untouched. `generate` is a seam for tests.
 */
export function writeNfcPaymentVectors(
  outPath: string,
  generate: () => NfcPaymentVectors = generateNfcPaymentVectors,
): NfcPaymentVectors {
  const vectors = generate();
  const mismatches = validateNfcPaymentVectors(vectors);
  if (mismatches.length > 0) {
    throw new Error(
      `Generated NFC vectors failed validation, ${outPath} not written: ${mismatches.join(', ')}`,
    );
  }
  fs.writeFileSync(outPath, JSON.stringify(vectors, null, 2), 'utf-8');
  return vectors;
}
