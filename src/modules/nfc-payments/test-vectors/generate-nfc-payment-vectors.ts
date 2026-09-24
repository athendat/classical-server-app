/**
 * `yarn vectors:nfc [outPath]`
 *
 * Regenerates the NFC Payment test vectors (default: the versioned
 * nfc-payment-vectors.json next to this file). Per ADR-0004, regenerated
 * vectors must ship to classical-mobile-app in the same change.
 */

import * as path from 'path';
import { Logger } from '@nestjs/common';

import { writeNfcPaymentVectors } from './nfc-payment-vectors.tool';

// The adapters log every derivation at debug level; keep the output readable.
Logger.overrideLogger(['log', 'warn', 'error']);

const outPath = path.resolve(process.argv[2] ?? path.join(__dirname, 'nfc-payment-vectors.json'));
// Validates in memory and throws before writing, so invalid vectors never
// overwrite the target file.
let vectors: ReturnType<typeof writeNfcPaymentVectors>;
try {
  vectors = writeNfcPaymentVectors(outPath);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

console.log(`Wrote ${vectors.ephemeral_keys.length} Counter vectors to ${outPath}`);
console.log('Ship them to classical-mobile-app in the same change (ADR-0004).');
