/**
 * Domain Port: EcdhCrypto
 * 
 * Contrato para operaciones criptográficas ECDH P-256 y derivación de claves.
 * Implementa seguridad según RFC 5869 (HKDF) y estándares ISO 9564.
 */

export interface KeyPairResult {
  /** Clave privada en formato PEM */
  privateKeyPem: string;
  /** Clave pública en formato Base64 (65 bytes uncompressed) */
  publicKeyBase64: string;
}

export interface ValidatePublicKeyResult {
  isValid: boolean;
  reason?: string;
}

export interface IEcdhCryptoPort {
  /**
   * Genera un nuevo par de claves ECDH P-256
   * La clave privada debe ser protegida y nunca exportada excepto a Vault
   */
  generateKeyPair(): Promise<KeyPairResult>;

  /**
   * Calcula el secreto compartido usando ECDH
   * shared_secret = ECDH(serverPrivateKey, devicePublicKey)
   *
   * @param devicePublicKeyBase64 - Clave pública del dispositivo en Base64 (65 bytes uncompressed)
   * @param serverPrivateKeyPem - Clave privada del servidor en formato PEM
   * @returns Buffer con el secreto compartido (32 bytes para P-256)
   */
  deriveSharedSecret(
    devicePublicKeyBase64: string,
    serverPrivateKeyPem: string,
  ): Promise<Buffer>;

  /**
   * Deriva material criptográfico usando HKDF-SHA256 (RFC 5869)
   * Implementa el protocolo de derivación de claves de docs/integration-guides/CAPTURA_SEGURA_DEL_PIN.md
   *
   * @param sharedSecret - Secreto compartido derivado de ECDH
   * @param salt - Salt único de 32 bytes en Base64
   * @param info - Info string para contexto (ej: "ATHPAY_DEVICE_MASTER_KEY_v1")
   * @returns DMK (Device Master Key) de 32 bytes + additional keying material
   */
  deriveHkdf(
    sharedSecret: Buffer,
    salt: Buffer,
    info: string,
  ): Promise<Buffer>;

  /**
   * Valida que una clave pública sea un punto válido en la curva P-256
   *
   * @param publicKeyBase64 - Clave pública en Base64
   * @returns { isValid: boolean, reason?: string }
   */
  validatePublicKey(publicKeyBase64: string): Promise<ValidatePublicKeyResult>;

  /**
   * Genera un salt aleatorio criptográficamente seguro
   *
   * @param lengthBytes - Longitud del salt en bytes (recomendado: 32)
   * @returns Salt en Buffer
   */
  generateSalt(lengthBytes: number): Promise<Buffer>;

  /**
   * Genera un key_handle opaco (identificador no reversible)
   *
   * @param lengthBytes - Longitud deseada del handle
   * @returns String alfanumérico
   */
  generateKeyHandle(lengthBytes: number): Promise<string>;
}
