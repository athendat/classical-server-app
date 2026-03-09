import { Result } from 'src/common/types/result.type';

/**
 * Respuesta del servidor SGT al activar PIN de una tarjeta
 */
export interface SgtActivatePinResponse {
  success: boolean;
  message?: string;
  data?: Record<string, any>;
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
   */
  activatePin(
    cardId: string,
    pan: string,
    pin: string,
  ): Promise<Result<SgtActivatePinResponse, Error>>;
}
