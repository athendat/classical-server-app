/**
 * Infrastructure Adapter: EcdsaSignatureAdapter
 *
 * Implementación de firma y verificación ECDSA con claves EC P-256
 * usando Node.js crypto nativo. Las firmas son DER-encoded.
 */

import { Injectable, Logger } from '@nestjs/common';

import * as crypto from 'crypto';

import { IEcdsaSignaturePort } from '../../domain/ports/ecdsa-signature.port';
import { NFC_PAYMENT_CONSTANTS } from '../../domain/constants/nfc-payment.constants';

@Injectable()
export class EcdsaSignatureAdapter implements IEcdsaSignaturePort {
  private readonly logger = new Logger(EcdsaSignatureAdapter.name);

  sign(payload: Buffer, privateKey: crypto.KeyObject): Buffer {
    const signature = crypto.sign(
      NFC_PAYMENT_CONSTANTS.SIGNATURE_ALGORITHM,
      payload,
      privateKey,
    );

    this.logger.debug(`Signed payload | signature length: ${signature.length} bytes`);
    return signature;
  }

  verify(
    payload: Buffer,
    signature: Buffer,
    publicKey: crypto.KeyObject,
  ): boolean {
    const isValid = crypto.verify(
      NFC_PAYMENT_CONSTANTS.SIGNATURE_ALGORITHM,
      payload,
      publicKey,
      signature,
    );

    this.logger.debug(`Verified signature | valid: ${isValid}`);
    return isValid;
  }
}
