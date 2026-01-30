import { Module } from '@nestjs/common';
import { InMemoryCacheService } from 'src/common/cache/in-memory-cache.service';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';

/**
 * SharedModule - Módulo compartido con servicios comunes
 * Proporciona:
 * - CACHE_SERVICE: Servicio de caché en memoria
 *
 * Importar este módulo en otros módulos que necesiten acceso a servicios compartidos
 */
@Module({
  providers: [
    {
      provide: INJECTION_TOKENS.CACHE_SERVICE,
      useClass: InMemoryCacheService,
    },
  ],
  exports: [INJECTION_TOKENS.CACHE_SERVICE],
})
export class SharedCacheModule {}
