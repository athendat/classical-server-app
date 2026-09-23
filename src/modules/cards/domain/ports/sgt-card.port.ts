import { Result } from 'src/common/types/result.type';

/**
 * Datos internos de la respuesta de activación de PIN del SGT
 */
export interface SgtActivatePinData {
  activationCode: string;
  isoResponseCode?: string;
  token?: string;
  balance?: string;
  additionalAmounts?: string;
  expirationDate?: string;
}

/**
 * Respuesta del servidor SGT al activar PIN de una tarjeta
 */
export interface SgtActivatePinResponse {
  ok: boolean;
  message: string;
  data?: SgtActivatePinData;
}

/**
 * Parámetros para realizar una transferencia contra el SGT
 */
export interface SgtTransferRequest {
  /** Token de la tarjeta (obtenido en el registro) */
  token: string;
  /** PINBLOCK en formato ISO-4 (se convertirá a formato SGT internamente) */
  pin: string;
  /** Monto total de la operación (12 dígitos, últimos 2 son decimales) */
  amount: string;
  /** Monto a acreditar al beneficiario (12 dígitos) */
  settlementAmount: string;
  /** Comisión de la pasarela (12 dígitos) */
  cardholderAmount: string;
  /** Cuenta del beneficiario (PAN o Token de la tarjeta destino) */
  beneficiaryAccount: string;
  /** Referencia única de la transacción (anti-replay) */
  clientReference: string;
  /** Tipo de operación: payment o refund */
  type: 'payment' | 'refund';
  /** Identificador del comercio (15 caracteres, zero-padded) */
  merchantId: string;
  /** Carnet de identidad (11 dígitos) */
  idNumber: string;
}

/**
 * Datos internos de la respuesta de transferencia del SGT
 */
export interface SgtTransferData {
  /**
   * Código de operación: TR000=éxito, TR001=rechazada, TR002=OK/balance fallido, TR003=error comunicación.
   * Solo TR000/TR001/TR002 son respuesta del Issuer; `transfer()` devuelve TR003 como `Result.fail`.
   */
  transferCode: string;
  /** Código de respuesta ISO 8583 del emisor */
  isoResponseCode?: string;
  /** Saldo de la tarjeta tras la transferencia */
  balance?: string;
  /** Montos adicionales */
  additionalAmounts?: string;
}

/**
 * Respuesta del servidor SGT al realizar una transferencia
 */
export interface SgtTransferResponse {
  ok: boolean;
  message: string;
  data?: SgtTransferData;
}

/**
 * Puerto de salida para la integración con el servidor SGT
 * Implementado por SgtCardAdapter en la capa de infraestructura
 */
export interface ISgtCardPort {
  /**
   * Verifica y activa el PIN de una tarjeta contra el módulo emisor (SGT)
   * Endpoint: POST /activate-pin
   * Auth: HMAC-SHA256
   *
   * @param token - Token del PAN recibido en un registro previo (AP002), para reintento de activación
   */
  activatePin(
    cardId: string,
    pan: string,
    pinblock: string,
    idNumber: string,
    tml: string,
    aut: string,
    token?: string,
  ): Promise<Result<SgtActivatePinResponse, Error>>;

  /**
   * Realiza una transferencia (pago o devolución) contra el SGT
   * Endpoint: POST /transfer
   * Auth: HMAC-SHA256
   * Flujo de 2 pasos: transferencia + consulta de saldo
   *
   * Contrato del resultado:
   * - `Result.ok`: el Issuer respondió, con transfer code TR000, TR001 o TR002. Incluye los
   *   rechazos del Issuer (TR001) y las respuestas con `ok: false`, sea cual sea el estado HTTP;
   *   el llamador decide éxito o rechazo por `data.transferCode` y persiste el código.
   * - `Result.fail`: no hay respuesta del Issuer: error de transporte, timeout, TR003
   *   (el SGT no pudo comunicarse con el Issuer) o transfer code desconocido o ausente.
   */
  transfer(
    request: SgtTransferRequest,
  ): Promise<Result<SgtTransferResponse, Error>>;
}
