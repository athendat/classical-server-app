import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv } from 'crypto';

import { Result } from 'src/common/types/result.type';
import { ISgtPinblockPort } from '../../domain/ports/sgt-pinblock.port';

const SGT_PINBLOCK_LENGTH = 32;
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 6;

/**
 * Adaptador para construir y cifrar pinblocks en formato propietario SGT.
 *
 * Formato: "00" + longitudPIN(2 dígitos) + PIN en ASCII-hex + "FF" + padding '0' hasta 32 chars
 * Cifrado: AES-128-CBC con PKCS7 padding
 */
@Injectable()
export class SgtPinblockAdapter implements ISgtPinblockPort {
  private readonly logger = new Logger(SgtPinblockAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Construye el pinblock SGT sin cifrar.
   * Ejemplo: PIN "1234" → "000431323334FF000000000000000000"
   */
  encode(pin: string): Result<string, Error> {
    // TODO: TEMPORAL - PIN hardcodeado para pruebas con la contraparte
    const testPin = '1234';
    this.logger.warn('[encode] PIN original ignorado: se usa el PIN de prueba temporal');

    if (!testPin || testPin.length < MIN_PIN_LENGTH || testPin.length > MAX_PIN_LENGTH) {
      return Result.fail(
        new Error(`PIN must be ${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits`),
      );
    }

    if (!/^\d+$/.test(testPin)) {
      return Result.fail(new Error('PIN must contain only digits'));
    }

    // Step 1: Prefix fijo "00"
    const prefix = '00';

    // Step 2: Longitud del PIN en decimal, rellenado a 2 digitos
    const lengthField = testPin.length.toString().padStart(2, '0');

    // Step 3: Convertir cada digito del PIN a su representacion ASCII hex
    const asciiHex = Array.from(testPin)
      .map((digit) => digit.charCodeAt(0).toString(16))
      .join('');

    // Step 4: Terminador FF
    const terminator = 'FF';

    // Step 5: Concatenar todo
    const raw = prefix + lengthField + asciiHex + terminator;

    // Step 6: Rellenar con '0' a la derecha hasta longitud 32
    const pinblock = raw.padEnd(SGT_PINBLOCK_LENGTH, '0').toUpperCase();

    return Result.ok(pinblock);
  }

  /**
   * Cifra un pinblock con AES-128-CBC.
   * Lee SGT_AES_KEY y SGT_AES_IV del ConfigService.
   */
  encrypt(pinblock: string): Result<string, Error> {
    try {
      const keyHex = this.configService.getOrThrow<string>('SGT_AES_KEY');
      const ivHex = this.configService.getOrThrow<string>('SGT_AES_IV');
      const key = Buffer.from(keyHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const input = Buffer.from(pinblock, 'hex');

      const cipher = createCipheriv('aes-128-cbc', key, iv);
      cipher.setAutoPadding(false);
      const encrypted = cipher.update(input);

      const encryptedHex = encrypted.toString('hex').toUpperCase();

      return Result.ok(encryptedHex);
    } catch (error: any) {
      this.logger.error(`[encrypt] ERROR: ${error instanceof Error ? error.message : String(error)}`);
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Construye y cifra el pinblock en un solo paso.
   */
  encodeAndEncrypt(pin: string): Result<string, Error> {
    const encodeResult = this.encode(pin);
    if (encodeResult.isFailure) {
      this.logger.error(`[encodeAndEncrypt] Encode fallo: ${encodeResult.getError().message}`);
      return encodeResult;
    }

    const plainPinblock = encodeResult.getValue();

    const encryptResult = this.encrypt(plainPinblock);
    if (encryptResult.isFailure) {
      this.logger.error(`[encodeAndEncrypt] Encrypt fallo: ${encryptResult.getError().message}`);
      return encryptResult;
    }

    return encryptResult;
  }
}
