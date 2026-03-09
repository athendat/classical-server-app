import { Result } from 'src/common/types/result.type';

/**
 * Puerto para la construcción y cifrado de pinblock en formato propietario SGT.
 * El formato SGT construye el pinblock como cadena ASCII-hex del PIN con prefijo
 * de longitud y terminador FF, luego lo cifra con AES-128-CBC.
 */
export interface ISgtPinblockPort {
  /** Construir pinblock SGT (sin cifrar) */
  encode(pin: string): Result<string, Error>;

  /** Cifrar pinblock con AES-128-CBC */
  encrypt(pinblock: string): Result<string, Error>;

  /** Construir y cifrar pinblock en un solo paso */
  encodeAndEncrypt(pin: string): Result<string, Error>;
}
