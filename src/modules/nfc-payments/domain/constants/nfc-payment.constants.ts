/**
 * Domain Constants: NFC Payment
 *
 * Constantes criptográficas para el módulo de pagos NFC.
 * Define parámetros HKDF, curva EC, y tags TLV.
 */

export const NFC_PAYMENT_CONSTANTS = {
  HKDF_HASH: 'sha256',
  HKDF_ROOT_INFO: 'nfc-payment',
  HKDF_KEY_INFO_PREFIX: 'nfc-payment-key:',
  HKDF_OUTPUT_LENGTH: 32,
  CURVE: 'prime256v1', // P-256
  SIGNATURE_ALGORITHM: 'SHA256',
};

export const NFC_TLV_TAGS = {
  CARD_ID: 0x01,
  AMOUNT: 0x02,
  CURRENCY: 0x03,
  POS_ID: 0x04,
  TX_REF: 0x05,
  NONCE: 0x06,
  COUNTER: 0x07,
  SERVER_TIMESTAMP: 0x08,
  SESSION_ID: 0x09,
  SIGNATURE: 0x0a,
};

/** Redis key helpers for NFC enrollment counters */
export const NFC_REDIS_KEYS = {
  counterKey: (rootKey: string, cardId: string) =>
    rootKey ? `${rootKey}:nfc:enrollment:counter:${cardId}` : `nfc:enrollment:counter:${cardId}`,
};

export const NFC_PAYMENT_INJECTION_TOKENS = {
  HKDF_KEY_DERIVATION_PORT: Symbol('IHkdfKeyDerivationPort'),
  ECDSA_SIGNATURE_PORT: Symbol('IEcdsaSignaturePort'),
  TLV_CODEC_PORT: Symbol('ITlvCodecPort'),
};

export const NFC_ENROLLMENT_INJECTION_TOKENS = {
  NFC_ENROLLMENT_REPOSITORY: Symbol('INfcEnrollmentRepository'),
};
