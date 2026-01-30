/**
 * Puerto para validación anti-replay de JWT.
 * Mantiene registro de JTIs (JWT ID) consumidos para evitar reuso.
 */
export interface IReplayProtectionPort {
  /**
   * Registrar un JTI como consumido.
   * @param jti JWT ID único
   * @param expiresAt Timestamp de expiración del token (ms)
   * @returns true si se registró exitosamente, false si ya existía (replay)
   */
  registerJti(jti: string, expiresAt: number): Promise<boolean>;

  /**
   * Verificar si un JTI ya fue consumido.
   * @param jti JWT ID
   * @returns true si ya fue consumido (replay), false si es nuevo
   */
  isJtiConsumed(jti: string): Promise<boolean>;

  /**
   * Limpiar JTIs expirados (para mantener costo de almacenamiento bajo).
   * @returns Número de JTIs limpiados
   */
  cleanupExpiredJtis(): Promise<number>;
}
