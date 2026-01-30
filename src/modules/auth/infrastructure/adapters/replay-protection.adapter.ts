import { Injectable, Logger } from '@nestjs/common';
import { IReplayProtectionPort } from '../../domain/ports/replay-protection.port';

/**
 * Adaptador en-memoria para anti-replay (desarrollo).
 * En producción, usar Redis o similar con TTL automático.
 *
 * Mantiene registro de JTIs consumidos para evitar reuso.
 */
@Injectable()
export class ReplayProtectionAdapter implements IReplayProtectionPort {
  private readonly logger = new Logger(ReplayProtectionAdapter.name);
  private jtiRegistry: Map<string, number> = new Map(); // jti -> expiresAt (ms)

  async registerJti(jti: string, expiresAt: number): Promise<boolean> {
    if (this.jtiRegistry.has(jti)) {
      this.logger.warn(`Replay attack detected: JTI ${jti} already consumed`);
      return false;
    }

    this.jtiRegistry.set(jti, expiresAt);

    // Programar limpieza cuando expire
    const timeToExpire = expiresAt - Date.now();
    if (timeToExpire > 0) {
      setTimeout(() => {
        this.jtiRegistry.delete(jti);
      }, timeToExpire + 1000); // +1s de margen
    }

    return true;
  }

  async isJtiConsumed(jti: string): Promise<boolean> {
    const expiresAt = this.jtiRegistry.get(jti);
    if (!expiresAt) return false;

    // Si ya expiró, no es un replay válido (token está rechazado por exp anyway)
    if (expiresAt < Date.now()) {
      this.jtiRegistry.delete(jti);
      return false;
    }

    return true;
  }

  async cleanupExpiredJtis(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [jti, expiresAt] of this.jtiRegistry.entries()) {
      if (expiresAt < now) {
        this.jtiRegistry.delete(jti);
        cleaned++;
      }
    }

    this.logger.debug(`Cleaned up ${cleaned} expired JTIs`);
    return cleaned;
  }
}
