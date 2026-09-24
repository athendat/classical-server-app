import { Result } from 'src/common/types/result.type';

/**
 * Datos internos de la respuesta de activación de PIN del SGT
 */
export interface SgtActivatePinData {
  /**
   * Código de activación: AP000=éxito, AP001=rechazada, AP002=registrada/activación fallida,
   * AP003=activada/balance fallido, AP004=error comunicación.
   * Solo AP000 a AP003 son respuesta del Issuer; `activatePin()` devuelve AP004 como `Result.fail`.
   */
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
 * Tipo de fallo de `activatePin()`:
 * - `NO_ISSUER_ANSWER`: se llamó al SGT y no hubo respuesta del Issuer (AP004, timeout,
 *   error HTTP o de red, activation code desconocido o ausente).
 * - `LOCAL_FAILURE`: falló la preparación de la petición antes de llamar al SGT
 *   (PIN block que no se decodifica o no se cifra, configuración del SGT ausente).
 */
export type SgtActivationFailureKind = 'NO_ISSUER_ANSWER' | 'LOCAL_FAILURE';

/** Error de `activatePin()`, con el tipo de fallo para que el llamador distinga el origen */
export class SgtActivationError extends Error {
  constructor(
    public readonly kind: SgtActivationFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'SgtActivationError';
  }
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
   *
   * Contrato del resultado:
   * - `Result.ok`: el Issuer respondió, con activation code AP000, AP001, AP002 o AP003. Incluye
   *   los rechazos del Issuer (AP001) y las respuestas con `ok: false`, sea cual sea el estado HTTP;
   *   el llamador decide por `data.activationCode`.
   * - `Result.fail` con un `SgtActivationError`:
   *   - `kind: 'NO_ISSUER_ANSWER'`: no hay respuesta del Issuer: error de transporte, timeout,
   *     AP004 (el SGT no pudo comunicarse con el Issuer) o activation code desconocido o ausente.
   *   - `kind: 'LOCAL_FAILURE'`: el SGT no llegó a llamarse (PIN block o configuración inválidos).
   */
  activatePin(
    cardId: string,
    pan: string,
    pinblock: string,
    idNumber: string,
    tml: string,
    aut: string,
    token?: string,
  ): Promise<Result<SgtActivatePinResponse, SgtActivationError>>;

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
