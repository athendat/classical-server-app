/**
 * Infrastructure Adapter: HkdfKeyDerivationAdapter
 *
 * Implementación de derivación de claves HKDF-SHA256 y generación de pares
 * de claves efímeras EC P-256 para pagos NFC usando Node.js crypto nativo.
 */

import { Injectable, Logger } from '@nestjs/common';

import * as crypto from 'crypto';

import { IHkdfKeyDerivationPort } from '../../domain/ports/hkdf-key-derivation.port';
import { NFC_PAYMENT_CONSTANTS } from '../../domain/constants/nfc-payment.constants';

@Injectable()
export class HkdfKeyDerivationAdapter implements IHkdfKeyDerivationPort {
  private readonly logger = new Logger(HkdfKeyDerivationAdapter.name);

  deriveRootSeed(sharedSecret: Buffer, salt: Buffer): Buffer {
    const derived = crypto.hkdfSync(
      NFC_PAYMENT_CONSTANTS.HKDF_HASH,
      sharedSecret,
      salt,
      NFC_PAYMENT_CONSTANTS.HKDF_ROOT_INFO,
      NFC_PAYMENT_CONSTANTS.HKDF_OUTPUT_LENGTH,
    );

    const result = Buffer.from(derived);
    this.logger.debug(`Derived root seed | length: ${result.length} bytes`);
    return result;
  }

  deriveEphemeralKeyPair(
    rootSeed: Buffer,
    counter: number,
  ): { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject } {
    const info = NFC_PAYMENT_CONSTANTS.HKDF_KEY_INFO_PREFIX + counter.toString();

    const derivedBytes = Buffer.from(
      crypto.hkdfSync(
        NFC_PAYMENT_CONSTANTS.HKDF_HASH,
        rootSeed,
        Buffer.alloc(0),
        info,
        NFC_PAYMENT_CONSTANTS.HKDF_OUTPUT_LENGTH,
      ),
    );

    // PKCS8 DER prefix for EC P-256 with 32-byte private key (minimal SEC1 without public key)
    // SEQUENCE { INTEGER v=0, AlgorithmIdentifier { EC, P-256 }, OCTET STRING { SEC1 SEQUENCE { INTEGER v=1, OCTET STRING(32) } } }
    const pkcs8Prefix = Buffer.from(
      '3041020100301306072a8648ce3d020106082a8648ce3d03010704273025020101' +
        '0420',
      'hex',
    );
    const pkcs8Der = Buffer.concat([pkcs8Prefix, derivedBytes]);

    const privateKey = crypto.createPrivateKey({
      key: pkcs8Der,
      format: 'der',
      type: 'pkcs8',
    });
    const publicKey = crypto.createPublicKey(privateKey);

    this.logger.debug(`Derived ephemeral key pair | counter: ${counter}`);

    return { privateKey, publicKey };
  }
}
