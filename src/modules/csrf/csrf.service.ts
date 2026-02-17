import { Injectable, Inject } from '@nestjs/common';

import { randomUUID } from 'crypto';
import { CacheService } from 'src/common/cache/cache.service';

@Injectable()
export class CsrfService {
  private readonly CSRF_PREFIX = 'csrf:';
  private readonly CSRF_TTL = 3600; // 1 día en segundos

  constructor(
    private readonly cacheService: CacheService,
  ) { }

  /**
   * Genera un nuevo token CSRF y lo almacena en cache
   */
  async generateToken(): Promise<string> {
    const token = randomUUID();
    await this.cacheService.set(this.CSRF_PREFIX + token, true, this.CSRF_TTL * 1000);
    return token;
  }

  /**
   * Valida un token CSRF
   */
  async validateToken(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    const key = this.CSRF_PREFIX + token;
    const exists = await this.cacheService.getByKey<boolean>(key);

    return !!exists;
  }

  /**
   * Invalida un token CSRF (útil para rotación)
   */
  async invalidateToken(token: string): Promise<void> {
    if (!token) {
      return;
    }

    const key = this.CSRF_PREFIX + token;
    await this.cacheService.delete(key);
  }

  /**
   * Rota un token CSRF: invalida el viejo y genera uno nuevo
   */
  async rotateToken(oldToken: string): Promise<string> {
    await this.invalidateToken(oldToken);
    return this.generateToken();
  }
}
