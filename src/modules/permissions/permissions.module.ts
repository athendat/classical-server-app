import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CachingModule } from 'src/common/cache/cache.module';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';

import { PermissionsService } from './application/permissions.service';

import { PermissionsGuard } from './infrastructure/guards/permissions.guard';

/**
 * PermissionsModule - Módulo independiente para resolución y validación de permisos
 *
 * Responsabilidades:
 * - Resolver permisos de actores (usuarios, servicios)
 * - Validar permisos mediante PermissionsGuard
 * - Implementar caché de permisos
 *
 * Ventajas:
 * - Módulo autónomo sin dependencias circulares
 * - Reutilizable en cualquier módulo sin ciclos
 * - Inyección lazy de UsersService mediante ModuleRef
 */
@Module({
  imports: [AuditModule, CachingModule, RolesModule, UsersModule],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsGuard, PermissionsService],
})
export class PermissionsModule {}
