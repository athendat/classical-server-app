import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { ModulesService } from '../application/modules.service';

import { SYSTEM_MODULES } from './system-modules';
import { Module as ModuleSchema } from '../infrastructure/schemas/module.schema';

/**
 * ModulesSeedService - Servicio heredado de seeding de módulos
 *
 * NOTA: La inicialización de módulos ahora es responsabilidad de SystemBootstrapService
 * que se ejecuta de forma centralizada en el ciclo de inicialización de NestJS.
 *
 * Este servicio se mantiene por compatibilidad pero no se ejecuta automáticamente.
 * Se puede invocar manualmente si es necesario re-seedear módulos.
 */
@Injectable()
export class ModulesSeedService {
  private readonly logger = new Logger(ModulesSeedService.name);

  constructor(
    @InjectModel('Module')
    private readonly moduleModel: Model<ModuleSchema>,
    private readonly modulesService: ModulesService,
  ) {}
  /**
   * Método público para seedear módulos manualmente si es necesario
   * Se puede invocar desde otros servicios o controladores si se requiere re-seedear
   */
  async seedIfNeeded(): Promise<void> {
    await this.checkAndSeedModules();
  }

  private async checkAndSeedModules(): Promise<void> {
    try {
      // Verificar si la colección de módulos está vacía
      const modulesCount = await this.moduleModel.countDocuments().exec();

      if (modulesCount > 0) {
        this.logger.log(
          `Modules collection already has ${modulesCount} documents - skipping auto-seed`,
        );
        return;
      }

      this.logger.log(
        '🌱 Modules collection is empty - starting auto-seed process...',
      );
      await this.seedSystemModules();
      this.logger.log('✅ Modules auto-seeding completed successfully');
    } catch (error: any) {
      this.logger.error(
        `Error during modules auto-seed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // No lanzar error - permitir que la app inicie aunque falle el seed
    }
  }

  /**
   * Seedear módulos del sistema
   * Inserta todos los SYSTEM_MODULES sin validación previa
   */
  private async seedSystemModules(): Promise<void> {
    let seedCount = 0;

    for (const module of SYSTEM_MODULES) {
      try {
        this.logger.log(`Seeding module: ${module.name}`);

        // Crear el módulo directamente usando el modelo
        // Usar la estructura que espera el ModulesService
        const createData = {
          name: module.name,
          parent: module.parent,
          order: module.order,
          indicator: module.indicator,
          description: module.description,
          icon: module.icon,
          actions: module.actions,
          permissions: module.permissions,
          status: 'active',
          isSystem: true,
        };

        await this.moduleModel.updateOne(
          { indicator: module.indicator },
          {
            $set: createData,
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true },
        );

        seedCount++;
        this.logger.log(`   ✓ Seeded module: ${module.name}`);
      } catch (error: any) {
        this.logger.warn(
          `   ⚠ Error seeding module '${module.name}': ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continuar con otros módulos aunque uno falle
      }
    }

    this.logger.log(
      `📊 Modules auto-seed summary: ${seedCount}/${SYSTEM_MODULES.length} modules seeded`,
    );
  }
}
