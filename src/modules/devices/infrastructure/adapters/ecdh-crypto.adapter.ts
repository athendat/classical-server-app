/**
 * Infrastructure Adapter: EcdhCryptoAdapter
 * 
 * Implementación de operaciones criptográficas ECDH P-256 usando Node.js crypto nativo.
 * Cumple con FIPS 186-4 y RFC 5869 (HKDF).
 */

import { Injectable, Logger } from '@nestjs/common';

import { generateKeyPairSync, createPrivateKey, createPublicKey, diffieHellman, randomBytes, hkdfSync } from 'crypto';

import { IEcdhCryptoPort, KeyPairResult, ValidatePublicKeyResult } from '../../domain/ports/ecdh-crypto.port';

import { DEVICE_KEY_CONSTANTS } from '../../domain/constants/device-key.constants';

@Injectable()
export class EcdhCryptoAdapter implements IEcdhCryptoPort {
  private readonly logger = new Logger(EcdhCryptoAdapter.name);

  /**
   * Genera un nuevo par de claves ECDH P-256
   * La clave privada se exporta como PEM para almacenamiento seguro en Vault
   */
  async generateKeyPair(): Promise<KeyPairResult> {
    try {
      // generateKeyPairSync produce KeyObjects válidos listos para exportar
      const { privateKey: privKeyObj, publicKey: pubKeyObj } = generateKeyPairSync('ec', {
        namedCurve: DEVICE_KEY_CONSTANTS.ECDH_CURVE,
      });

      // Exportar clave privada como PEM/PKCS8 para almacenamiento seguro en Vault
      const privateKeyPem = privKeyObj.export({ format: 'pem', type: 'pkcs8' }) as string;

      // Extraer clave pública en formato uncompressed (65 bytes) desde la estructura SPKI DER.
      // El encabezado SPKI de P-256 ocupa exactamente 26 bytes; a partir del byte 26
      // se encuentran los 65 bytes del punto no comprimido (0x04 || X || Y).
      const spkiDer = pubKeyObj.export({ format: 'der', type: 'spki' }) as Buffer;
      const publicKeyBuffer = spkiDer.subarray(26); // 65 bytes: 0x04 + 32 bytes X + 32 bytes Y
      const publicKeyBase64 = publicKeyBuffer.toString('base64');

      this.logger.debug(`Generated new key pair | public key length: ${publicKeyBase64.length} chars`);

      return {
        privateKeyPem,
        publicKeyBase64,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate key pair: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calcula el secreto compartido ECDH entre servidor y dispositivo
   * shared_secret = ECDH(serverPrivateKey, devicePublicKey)
   */
  async deriveSharedSecret(
    devicePublicKeyBase64: string,
    serverPrivateKeyPem: string,
  ): Promise<Buffer> {
    try {
      // Importar clave privada del servidor desde PEM/PKCS8
      const privateKeyObject = createPrivateKey({
        key: serverPrivateKeyPem,
        format: 'pem',
      });

      // Reconstruir la clave pública del dispositivo como KeyObject.
      // El dispositivo envía los 65 bytes crudos en Base64 (punto no comprimido P-256).
      // Para que Node.js lo acepte como KeyObject, se construye una estructura SPKI DER
      // anteponiendo el encabezado estándar de 26 bytes de P-256.
      const P256_SPKI_HEADER = Buffer.from(
        '3059301306072A8648CE3D020106082A8648CE3D030107034200',
        'hex',
      );
      const rawDevicePublicKey = Buffer.from(devicePublicKeyBase64, 'base64');
      const spkiDer = Buffer.concat([P256_SPKI_HEADER, rawDevicePublicKey]);
      const devicePublicKeyObject = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });

      // Computar secreto compartido ECDH usando ambos KeyObjects válidos
      const sharedSecret = diffieHellman({
        privateKey: privateKeyObject,
        publicKey: devicePublicKeyObject,
      });

      this.logger.debug(`Derived shared secret | length: ${sharedSecret.length} bytes`);

      return sharedSecret;
    } catch (error: any) {
      this.logger.error(`Failed to derive shared secret: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deriva material criptográfico usando HKDF-SHA256 (RFC 5869)
   * Implementa el protocolo especificado en CAPTURA_SEGURA_DEL_PIN.md
   */
  async deriveHkdf(
    sharedSecret: Buffer,
    salt: Buffer,
    info: string,
  ): Promise<Buffer> {
    try {
      const hkdf = hkdfSync(
        'sha256',
        sharedSecret,
        salt,
        info,
        DEVICE_KEY_CONSTANTS.HKDF_OUTPUT_LENGTH,
      );
      
      // Convertir a Buffer si es necesario (hkdfSync puede retornar ArrayBuffer)
      const hkdfBuffer = Buffer.isBuffer(hkdf) ? hkdf : Buffer.from(hkdf);
      
      this.logger.debug(`Derived HKDF material | length: ${hkdfBuffer.length} bytes`);
      
      return hkdfBuffer;
    } catch (error: any) {
      this.logger.error(`Failed to derive HKDF: ${error.message}`);
      throw error;
    }
  }

  /**
   * Valida que una clave pública sea un punto válido en la curva P-256
   */
  async validatePublicKey(publicKeyBase64: string): Promise<ValidatePublicKeyResult> {
    try {
      // Convertir de Base64
      const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
      
      // Validar longitud (debe ser 65 bytes para formato uncompressed)
      if (publicKeyBuffer.length !== 65) {
        return {
          isValid: false,
          reason: `Invalid length: expected 65 bytes for uncompressed P-256 key, got ${publicKeyBuffer.length}`,
        };
      }
      
      // Validar primer byte (0x04 para uncompressed)
      if (publicKeyBuffer[0] !== 0x04) {
        return {
          isValid: false,
          reason: `Invalid format: expected uncompressed key (0x04 prefix), got 0x${publicKeyBuffer[0].toString(16)}`,
        };
      }
      
      // Validación básica: el resto de bytes debe ser válido
      // Para validación criptográfica completa, usar bibliotecas especializadas
      this.logger.debug(`Validated public key | Base64 length: ${publicKeyBase64.length}`);
      
      return { isValid: true };
    } catch (error: any) {
      return {
        isValid: false,
        reason: `Error validating public key: ${error.message}`,
      };
    }
  }

  /**
   * Genera un salt aleatorio criptográficamente seguro
   */
  async generateSalt(lengthBytes: number): Promise<Buffer> {
    try {
      const salt = randomBytes(lengthBytes);
      this.logger.debug(`Generated salt | length: ${salt.length} bytes`);
      return salt;
    } catch (error: any) {
      this.logger.error(`Failed to generate salt: ${error.message}`);
      throw error;
    }
  }

  /**
   * Genera un key_handle opaco (identificador no reversible de base64)
   */
  async generateKeyHandle(lengthBytes: number = 32): Promise<string> {
    try {
      const randomData = randomBytes(lengthBytes);
      const keyHandle = randomData.toString('base64url').substring(0, 32);
      this.logger.debug(`Generated key_handle | length: ${keyHandle.length} chars`);
      return keyHandle;
    } catch (error: any) {
      this.logger.error(`Failed to generate key_handle: ${error.message}`);
      throw error;
    }
  }
}
