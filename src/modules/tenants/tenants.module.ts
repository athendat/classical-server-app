import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AuthzModule } from '../authz/authz.module';
import { AuditModule } from '../audit/audit.module';
import { TenantsService } from './application/tenant.service';
import { TenantController } from './infrastructure/controllers/tenant.controller';
import { TenantRepository } from './infrastructure/adapters/tenant.repository';
import { TenantLifecycleRepository } from './infrastructure/adapters/tenant-lifecycle.repository';
import { TenantVaultService } from './infrastructure/services/tenant-vault.service';

import { Tenant, TenantSchema } from './infrastructure/schemas/tenant.schema';
import {
  TenantLifecycle,
  TenantLifecycleSchema,
} from './infrastructure/schemas/tenant-lifecycle.schema';
import { AsyncContextService } from 'src/common/context';

/**
 * TenantsModule - Módulo NestJS para gestión de tenants (negocios)
 * Incluye:
 * - CRUD de tenants
 * - Máquina de estados con xstate
 * - Almacenamiento de datos sensibles en Vault (Luhn + PAN)
 * - Historial de ciclo de vida en MongoDB
 * - Endpoints documentados con Swagger
 */
@Module({
  imports: [
    AuthzModule,
    AuditModule,
    EventEmitterModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: Tenant.name,
        schema: TenantSchema,
      },
      {
        name: TenantLifecycle.name,
        schema: TenantLifecycleSchema,
      },
    ]),
  ],
  providers: [
    AsyncContextService,
    TenantsService,
    TenantRepository,
    TenantLifecycleRepository,
    TenantVaultService,
  ],
  controllers: [TenantController],
  exports: [TenantsService, TenantRepository],
})
export class TenantsModule {}
