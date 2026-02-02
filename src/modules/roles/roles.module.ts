import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuditModule } from '../audit/audit.module';
import { CachingModule } from 'src/common/cache/cache.module';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { RolesService } from './application/roles.service';

import { RolesController } from './infrastructure/controllers/roles.controller';

import { RolesRepository } from './infrastructure/adapters';
import { RoleSchema } from './infrastructure/schemas/role.schema';

/**
 * RolesModule - Módulo NestJS para gestión de roles
 * Arquitectura hexagonal con independencia de infraestructura
 */
@Module({
  imports: [
    AuditModule,
    CachingModule,
    MongooseModule.forFeature([
      {
        name: 'Role',
        schema: RoleSchema,
      },
    ]),
  ],
  providers: [AsyncContextService, RolesRepository, RolesService],
  controllers: [RolesController],
  exports: [RolesService, RolesRepository],
})
export class RolesModule {}
