import { Global, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CachingModule } from 'src/common/cache/cache.module';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';

import { PermissionsService } from './application/permissions.service';

import { PermissionsGuard } from './infrastructure/guards/permissions.guard';

/**
 * PermissionsModule - Módulo global para resolución y validación de permisos.
 *
 * Marcado `@Global()` para que cualquier controller que use
 * `@UseGuards(PermissionsGuard)` o `@Permissions(...)` pueda resolver
 * `PermissionsService` y `PermissionsGuard` sin necesidad de importar
 * el módulo en cada feature module. Esto evita ciclos: `PermissionsModule`
 * ya importa `AuditModule` (PermissionsGuard audita denials), por lo que
 * un import recíproco — Audit → Permissions — provocaría un ciclo y
 * obligaría a usar `forwardRef` en cada lugar.
 *
 * Responsabilidades:
 * - Resolver permisos de actores (usuarios, servicios)
 * - Validar permisos mediante PermissionsGuard
 * - Implementar caché de permisos
 *
 * Cubre issue #33 — el server fallaba en bootstrap porque AuditModule,
 * RolesModule y UsersModule activaron `PermissionsGuard` en sus
 * controllers sin tener `PermissionsService` disponible en su contexto.
 */
@Global()
@Module({
  imports: [AuditModule, CachingModule, RolesModule, UsersModule],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsGuard, PermissionsService],
})
export class PermissionsModule {}
