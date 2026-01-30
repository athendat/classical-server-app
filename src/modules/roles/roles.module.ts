import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthzModule } from '../authz/authz.module';
import { AuditModule } from '../audit/audit.module';

import { RolesService } from './application/roles.service';
import { RolesController } from './infrastructure/controllers/roles.controller';
import { MongoDBRolesRepository } from './infrastructure/adapters';

import { Role, RoleSchema } from './infrastructure/schemas/role.schema';
import { AsyncContextService } from 'src/common/context/async-context.service';

/**
 * RolesModule - Módulo NestJS para gestión de roles
 * Arquitectura hexagonal con independencia de infraestructura
 */
@Module({
  imports: [
    AuthzModule,
    AuditModule,
    MongooseModule.forFeature([
      {
        name: Role.name,
        schema: RoleSchema,
      },
    ]),
  ],
  providers: [AsyncContextService, MongoDBRolesRepository, RolesService],
  controllers: [RolesController],
  exports: [RolesService, MongoDBRolesRepository],
})
export class RolesModule {}
