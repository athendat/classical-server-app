/**
 * Domain Port: HkdfKeyDerivation
 *
 * Contrato para derivación de claves HKDF-SHA256 y generación de pares
 * de claves efímeras EC P-256 para pagos NFC.
 */

import * as crypto from 'crypto';

export interface IHkdfKeyDerivationPort {
  deriveRootSeed(sharedSecret: Buffer, salt: Buffer): Buffer;
  deriveEphemeralKeyPair(
    rootSeed: Buffer,
    counter: number,
  ): { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject };
}
