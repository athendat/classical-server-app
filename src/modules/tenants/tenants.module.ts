import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { TenantsService } from './application/tenant.service';
import { TenantWebhooksService } from './application/services/tenant-webhooks.service';
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
import { TenantOAuth2CredentialsService } from './application/services/tenant-oauth2-credentials.service';

/**
 * TenantsModule - Módulo NestJS para gestión de tenants (negocios)
 * Incluye:
 * - CRUD de tenants
 * - Máquina de estados con xstate
 * - Almacenamiento de datos sensibles en Vault (Luhn + PAN)
 * - Historial de ciclo de vida en MongoDB
 * - Gestión de webhooks para notificaciones de eventos
 * - Endpoints documentados con Swagger
 */
@Module({
  imports: [
    PermissionsModule,
    AuditModule,
    CryptoModule,
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
    TenantWebhooksService,
    TenantOAuth2CredentialsService,
    TenantRepository,
    TenantLifecycleRepository,
    TenantVaultService,
  ],
  controllers: [TenantController],
  exports: [TenantsService, TenantRepository, TenantWebhooksService],
})
export class TenantsModule {}
