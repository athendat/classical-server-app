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
    this.logger.warn(`[encode] >>> PIN original ignorado, usando PIN de prueba: "${testPin}"`);

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
    this.logger.log(`[encode] Step 1 - Prefix fijo: "${prefix}"`);

    // Step 2: Longitud del PIN en decimal, rellenado a 2 digitos
    const lengthField = testPin.length.toString().padStart(2, '0');
    this.logger.log(`[encode] Step 2 - Length field (longitud ${testPin.length}): "${lengthField}"`);

    // Step 3: Convertir cada digito del PIN a su representacion ASCII hex
    const asciiHexParts = Array.from(testPin).map((digit) => {
      const hex = digit.charCodeAt(0).toString(16);
      this.logger.log(`[encode] Step 3 - Digito '${digit}' → ASCII 0x${hex} (decimal ${digit.charCodeAt(0)})`);
      return hex;
    });
    const asciiHex = asciiHexParts.join('');
    this.logger.log(`[encode] Step 3 - PIN completo en ASCII-hex: "${asciiHex}"`);

    // Step 4: Terminador FF
    const terminator = 'FF';
    this.logger.log(`[encode] Step 4 - Terminador: "${terminator}"`);

    // Step 5: Concatenar todo
    const raw = prefix + lengthField + asciiHex + terminator;
    this.logger.log(`[encode] Step 5 - Cadena concatenada (antes de padding): "${raw}" (longitud: ${raw.length})`);

    // Step 6: Rellenar con '0' a la derecha hasta longitud 32
    const pinblock = raw.padEnd(SGT_PINBLOCK_LENGTH, '0').toUpperCase();
    this.logger.log(`[encode] Step 6 - Pinblock final (con padding a 32 chars): "${pinblock}" (longitud: ${pinblock.length})`);

    return Result.ok(pinblock);
  }

  /**
   * Cifra un pinblock con AES-128-CBC.
   * Lee SGT_AES_KEY y SGT_AES_IV del ConfigService.
   */
  encrypt(pinblock: string): Result<string, Error> {
    try {
      this.logger.log(`[encrypt] >>> Pinblock a cifrar: "${pinblock}"`);

      const keyHex = this.configService.getOrThrow<string>('SGT_AES_KEY');
      const ivHex = this.configService.getOrThrow<string>('SGT_AES_IV');

      this.logger.log(`[encrypt] Step 1 - AES Key (hex): "${keyHex}"`);
      this.logger.log(`[encrypt] Step 1 - AES IV  (hex): "${ivHex}"`);

      const key = Buffer.from(keyHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');

      this.logger.log(`[encrypt] Step 2 - Key buffer length: ${key.length} bytes (esperado: 16)`);
      this.logger.log(`[encrypt] Step 2 - IV  buffer length: ${iv.length} bytes (esperado: 16)`);

      const input = Buffer.from(pinblock, 'hex');
      this.logger.log(`[encrypt] Step 3 - Input buffer (pinblock en bytes): ${input.toString('hex').toUpperCase()} (length: ${input.length} bytes)`);

      const cipher = createCipheriv('aes-128-cbc', key, iv);
      cipher.setAutoPadding(false);
      const encrypted = cipher.update(input);

      const encryptedHex = encrypted.toString('hex').toUpperCase();
      this.logger.log(`[encrypt] Step 4 - Resultado cifrado AES-128-CBC sin padding (hex): "${encryptedHex}" (length: ${encrypted.length} bytes)`);

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
    this.logger.log(`[encodeAndEncrypt] === INICIO ===`);
    this.logger.log(`[encodeAndEncrypt] PIN recibido (sera ignorado): "${pin}"`);

    const encodeResult = this.encode(pin);
    if (encodeResult.isFailure) {
      this.logger.error(`[encodeAndEncrypt] Encode fallo: ${encodeResult.getError().message}`);
      return encodeResult;
    }

    const plainPinblock = encodeResult.getValue();
    this.logger.log(`[encodeAndEncrypt] Pinblock plano generado: "${plainPinblock}"`);

    const encryptResult = this.encrypt(plainPinblock);
    if (encryptResult.isFailure) {
      this.logger.error(`[encodeAndEncrypt] Encrypt fallo: ${encryptResult.getError().message}`);
      return encryptResult;
    }

    this.logger.log(`[encodeAndEncrypt] Pinblock cifrado final: "${encryptResult.getValue()}"`);
    this.logger.log(`[encodeAndEncrypt] === FIN ===`);

    return encryptResult;
  }
}
