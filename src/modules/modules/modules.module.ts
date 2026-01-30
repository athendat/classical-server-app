import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthzModule } from '../authz/authz.module';
import { AuditModule } from '../audit/audit.module';

import { ModulesService } from './application/modules.service';
import { NavigationService } from './application/navigation.service';
import { ModulesSeedService } from './seeds/modules-seed.service';

import { ModulesController } from './infrastructure/controllers';

import { MongoDBModulesRepository } from './infrastructure/adapters';

import { ModuleSchemaFactory } from './infrastructure/schemas/module.schema';
import { AsyncContextService } from '../../common/context/async-context.service';
import { CachingModule } from 'src/common/cache/cache.module';

/**
 * ModulesModule - Módulo NestJS para gestión de módulos
 * Arquitectura hexagonal con independencia de infraestructura
 */
@Module({
  imports: [
    AuthzModule,
    AuditModule,
    CachingModule,
    MongooseModule.forFeature([
      {
        name: 'Module',
        schema: ModuleSchemaFactory,
      },
    ]),
  ],
  providers: [
    AsyncContextService,
    MongoDBModulesRepository,
    ModulesService,
    NavigationService,
    ModulesSeedService,
  ],
  controllers: [ModulesController],
  exports: [ModulesService, NavigationService, MongoDBModulesRepository],
})
export class ModulesModule {}
