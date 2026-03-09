import { Injectable } from '@nestjs/common';
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
  constructor(private readonly configService: ConfigService) {}

  /**
   * Construye el pinblock SGT sin cifrar.
   * Ejemplo: PIN "1234" → "000431323334FF000000000000000000"
   */
  encode(pin: string): Result<string, Error> {
    if (!pin || pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH) {
      return Result.fail(
        new Error(`PIN must be ${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits`),
      );
    }

    if (!/^\d+$/.test(pin)) {
      return Result.fail(new Error('PIN must contain only digits'));
    }

    const prefix = '00';
    const lengthField = pin.length.toString().padStart(2, '0');
    const asciiHex = Array.from(pin)
      .map((digit) => digit.charCodeAt(0).toString(16))
      .join('');
    const terminator = 'FF';

    const raw = prefix + lengthField + asciiHex + terminator;
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

      const cipher = createCipheriv('aes-128-cbc', key, iv);
      const input = Buffer.from(pinblock, 'hex');

      const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);

      return Result.ok(encrypted.toString('hex').toUpperCase());
    } catch (error: any) {
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
      return encodeResult;
    }

    return this.encrypt(encodeResult.getValue());
  }
}
