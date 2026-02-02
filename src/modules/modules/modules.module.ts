import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuditModule } from '../audit/audit.module';
import { CachingModule } from 'src/common/cache/cache.module';
// import { PermissionsModule } from '../permissions/permissions.module';

import { AsyncContextService } from '../../common/context/async-context.service';
import { ModulesService } from './application/modules.service';
import { NavigationService } from './application/navigation.service';
import { ModulesSeedService } from './seeds/modules-seed.service';

import { ModulesController } from './infrastructure/controllers';

import { ModulesRepository } from './infrastructure/adapters';

import { ModuleSchema } from './infrastructure/schemas/module.schema';

/**
 * ModulesModule - Módulo NestJS para gestión de módulos
 * Arquitectura hexagonal con independencia de infraestructura
 */
@Module({
  imports: [
    // PermissionsModule,
    AuditModule,
    CachingModule,
    MongooseModule.forFeature([
      {
        name: 'Module',
        schema: ModuleSchema,
      },
    ]),
  ],
  providers: [
    AsyncContextService,
    ModulesRepository,
    ModulesService,
    NavigationService,
    ModulesSeedService,
  ],
  controllers: [ModulesController],
  exports: [ModulesService, NavigationService, ModulesRepository],
})
export class ModulesModule {}
