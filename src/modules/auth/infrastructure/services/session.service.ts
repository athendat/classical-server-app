import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from 'src/common/cache/cache.service';
import type {
  ISessionPort,
  SessionData,
} from '../../domain/interfaces/session.interface';

/**
 * Servicio para gestionar sesiones de usuario usando caché Redis
 */
@Injectable()
export class SessionService implements ISessionPort {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Guarda los datos de sesión en caché con TTL especificado
   * @param userId ID del usuario
   * @param sessionData Datos de la sesión
   * @param ttl Tiempo de vida en segundos
   */
  async saveSession(
    userId: string,
    sessionData: SessionData,
    ttl: number,
  ): Promise<void> {
    const key = this.getSessionKey(userId);
    await this.cacheService.set(key, sessionData, ttl);
    this.logger.debug(`Session saved for user ${userId} with TTL ${ttl}s`);
  }

  /**
   * Obtiene los datos de sesión del caché
   * @param userId ID del usuario
   * @returns Datos de sesión o null si no existe
   */
  async getSession(userId: string): Promise<SessionData | null> {
    const key = this.getSessionKey(userId);
    const sessionData = await this.cacheService.getByKey<SessionData>(key);
    if (sessionData) {
      this.logger.debug(`Session retrieved for user ${userId}`);
    }
    return sessionData;
  }

  /**
   * Actualiza los datos de sesión parcialmente
   * @param userId ID del usuario
   * @param sessionData Datos parciales a actualizar
   * @param ttl Tiempo de vida en segundos
   */
  async updateSession(
    userId: string,
    sessionData: Partial<SessionData>,
    ttl: number,
  ): Promise<void> {
    const key = this.getSessionKey(userId);
    const existingSession = await this.cacheService.getByKey<SessionData>(key);

    if (!existingSession) {
      this.logger.warn(`No session found for user ${userId} to update`);
      return;
    }

    const updatedSession = {
      ...existingSession,
      ...sessionData,
    };

    await this.cacheService.set(key, updatedSession, ttl);
    this.logger.debug(`Session updated for user ${userId} with TTL ${ttl}s`);
  }

  /**
   * Elimina la sesión del caché
   * @param userId ID del usuario
   */
  async clearSession(userId: string): Promise<void> {
    const key = this.getSessionKey(userId);
    await this.cacheService.delete(key);
    this.logger.debug(`Session cleared for user ${userId}`);
  }

  /**
   * Genera la clave de sesión para el usuario
   * @param userId ID del usuario
   * @returns Clave de sesión
   */
  private getSessionKey(userId: string): string {
    return `session:${userId}`;
  }
}
