import { TenantStatus } from '../enums';

/**
 * Interfaz que define los datos de un evento en el ciclo de vida del tenant
 */
export interface TenantLifecycleEvent {
  /**
   * ID del tenant que cambió de estado
   */
  tenantId: string;

  /**
   * Estado anterior
   */
  fromState: TenantStatus;

  /**
   * Estado nuevo
   */
  toState: TenantStatus;

  /**
   * Usuario que disparó la transición
   */
  triggeredBy: {
    userId: string;
    username: string;
    roleKey: string;
  };

  /**
   * Comentario opcional sobre la transición
   */
  comment?: string;

  /**
   * Timestamp de la transición
   */
  timestamp: Date;

  /**
   * Snapshot completo de la máquina de estados en ese momento
   */
  xstateSnapshot?: Record<string, any>;
}
