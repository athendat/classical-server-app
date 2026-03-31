/**
 * Domain Port: EcdsaSignature
 *
 * Contrato para operaciones de firma y verificación ECDSA con claves EC P-256.
 * Las firmas son DER-encoded según estándar ECDSA.
 */

import * as crypto from 'crypto';

export interface IEcdsaSignaturePort {
  sign(payload: Buffer, privateKey: crypto.KeyObject): Buffer;
  verify(
    payload: Buffer,
    signature: Buffer,
    publicKey: crypto.KeyObject,
  ): boolean;
}
