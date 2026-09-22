/**
 * Domain Constants
 * 
 * Constantes criptográficas y de configuración para el módulo de dispositivos.
 * Alineadas con la especificación PCI-DSS y docs/integration-guides/CAPTURA_SEGURA_DEL_PIN.md
 */

export const DEVICE_KEY_CONSTANTS = {
  /**
   * Curva elíptica para ECDH
   * P-256 (secp256r1) es la curva estándar recomendada en FIPS 186-4
   */
  ECDH_CURVE: 'prime256v1',

  /**
   * Durabilidad de la clave: 365 días (1 año)
   * Cumple con requisito PCI-DSS 3.6.4 (rotación criptográfica de claves)
   */
  KEY_VALIDITY_DAYS: 365,

  /**
   * Longitud del salt en bytes
   * RFC 5869 recomienda mínimo 14 bytes; usamos 32 bytes para máxima seguridad
   */
  SALT_LENGTH_BYTES: 32,

  /**
   * Info string para HKDF-SHA256
   * Contexto específico de la aplicación, similar a docs/integration-guides/CAPTURA_SEGURA_DEL_PIN.md
   */
  HKDF_INFO: 'ATHPAY_DEVICE_MASTER_KEY_v1',

  /**
   * Intervalo de rotación periódica de claves
   * Cada 90 días se rota automáticamente (defensa en profundidad)
   */
  KEY_ROTATION_INTERVAL_DAYS: 90,

  /**
   * Ventana de precaución antes de expiración
   * 30 días antes de expirar, el cliente debe renovar
   */
  KEY_EXPIRATION_WARNING_DAYS: 30,

  /**
   * Ruta en HashiCorp Vault para almacenar claves privadas del servidor
   * Formato: secret/devices/keys/{keyHandle}/private
   */
  VAULT_PATH_DEVICE_KEYS: 'secret/devices/keys',

  /**
   * Versión del protocolo E2E
   * Versión 1 como se especifica en docs/integration-guides/CAPTURA_SEGURA_DEL_PIN.md
   */
  E2E_PROTOCOL_VERSION: 'E2E1',

  /**
   * Longitud Base64 esperada de una clave pública ECDH P-256 sin comprimir
   * 65 bytes descomprimidos = 88 caracteres en Base64 (65 * 4 / 3 redondeado)
   */
  ECDH_PUBLIC_KEY_BASE64_LENGTH: 88,

  /**
   * Máximo número de dispositivos permitidos por usuario
   * Límite de seguridad para prevenir abuso (ej: clonación masiva)
   */
  MAX_DEVICES_PER_USER: 10,

  /**
   * Máximo número de rotaciones permitidas en un período de 24 horas
   * Prevención de ataques DoS (rotación constante solicitada)
   */
  MAX_ROTATIONS_PER_24H: 5,

  /**
   * Duración en segundos del caché en memoria para claves privadas del servidor
   * Recuperadas de Vault con este TTL para balance entre seguridad y performance
   */
  PRIVATE_KEY_CACHE_TTL_SECONDS: 300, // 5 minutos

  /**
   * Tamaño del hash en bytes que regresa HKDF para material de clave simétrica
   * Suficiente para AES-256 (32 bytes) + HMAC-SHA256 (32 bytes)
   */
  HKDF_OUTPUT_LENGTH: 64,

  /**
   * Longitud de key_handle en caracteres (string alfanumérico opaco)
   * Generado como identificador único no reversible
   */
  KEY_HANDLE_LENGTH: 32,
} as const;

/**
 * Type definitions para acceso type-safe a constantes
 */
export type EcdhCurve = typeof DEVICE_KEY_CONSTANTS.ECDH_CURVE;
export type E2eProtocolVersion = typeof DEVICE_KEY_CONSTANTS.E2E_PROTOCOL_VERSION;
export type HkdfInfo = typeof DEVICE_KEY_CONSTANTS.HKDF_INFO;
