import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { SYSTEM_MODULES } from 'src/modules/modules/seeds/system-modules';
import { SYSTEM_ROLES } from 'src/modules/roles/seeds/system-roles';
import { UsersService } from 'src/modules/users/application/users.service';

/**
 * SystemBootstrapService - Inicialización centralizada del sistema
 *
 * Orquesta el seeding de datos en el siguiente orden:
 * 1. Módulos → base para la navegación
 * 2. Roles → define permisos del sistema (resueltos dinámicamente)
 * 3. Super Admin → primer usuario del sistema
 *
 * Implementa idempotencia: no crea duplicados, respeta datos preexistentes
 *
 * Nota: Los permisos (SYSTEM_PERMISSIONS) se resuelven dinámicamente desde los roles,
 * no se almacenan en una colección separada. Por eso no hay PHASE 2 para permisos.
 */
@Injectable()
export class SystemBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SystemBootstrapService.name);

  constructor(
    private configService: ConfigService,
    @InjectModel('Module') private moduleModel: Model<any>,
    @InjectModel('Role') private roleModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    private usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Starting system bootstrap initialization...');

    try {
      // PHASE 1: Bootstrap modules
      await this.bootstrapModules();

      // PHASE 2: Bootstrap roles
      await this.bootstrapRoles();

      // PHASE 3: Bootstrap super admin
      await this.bootstrapSuperAdmin();

      this.logger.log('✅ System bootstrap completed successfully');
    } catch (error: any) {
      this.logger.error(
        `❌ System bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // No lanzar error - permitir que la app continúe iniciando
    }
  }

  /**
   * PHASE 1: Bootstrap módulos
   */
  private async bootstrapModules(): Promise<void> {
    this.logger.log('📦 PHASE 1: Bootstrap modules...');

    try {
      const count = await this.moduleModel.countDocuments().exec();

      if (count > 0) {
        this.logger.log(
          `   ⏭️  Modules collection already has ${count} documents - skipping seed`,
        );
        return;
      }

      let seedCount = 0;
      for (const module of SYSTEM_MODULES) {
        try {
          await this.moduleModel.updateOne(
            { indicator: module.indicator },
            {
              $set: {
                ...module,
                status: 'active',
                isSystem: true,
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            { upsert: true },
          );
          seedCount++;
        } catch (error: any) {
          this.logger.warn(
            `   ⚠️  Error seeding module '${module.name}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `✅ PHASE 1 completed: ${seedCount}/${SYSTEM_MODULES.length} modules seeded`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error during PHASE 1: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * PHASE 2: Bootstrap roles
   * Nota: Permisos se resuelven dinámicamente desde roles,
   * no se almacenan en una colección separada
   */
  private async bootstrapRoles(): Promise<void> {
    this.logger.log('👥 PHASE 2: Bootstrap roles...');

    try {
      const count = await this.roleModel.countDocuments().exec();

      if (count > 0) {
        this.logger.log(
          `   ⏭️  Roles collection already has ${count} documents - skipping seed`,
        );
        return;
      }

      let seedCount = 0;
      for (const role of SYSTEM_ROLES) {
        try {
          await this.roleModel.updateOne(
            { key: role.key },
            {
              $set: {
                ...role,
                isSystem: true,
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            { upsert: true },
          );
          seedCount++;
        } catch (error: any) {
          this.logger.warn(
            `   ⚠️  Error seeding role '${role.key}': ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `✅ PHASE 2 completed: ${seedCount}/${SYSTEM_ROLES.length} roles seeded`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error during PHASE 2: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * PHASE 3: Bootstrap super admin user
   */
  private async bootstrapSuperAdmin(): Promise<void> {
    this.logger.log('👨‍💼 PHASE 3: Bootstrap super admin user...');

    try {
      const count = await this.userModel.countDocuments().exec();

      if (count > 0) {
        this.logger.log(
          `   ⏭️  Users collection already has ${count} documents - skipping seed`,
        );
        return;
      }

      const saEmail = this.configService.get<string>('SA_EMAIL');
      const saPwd = this.configService.get<string>('SA_PWD');

      if (!saEmail || !saPwd) {
        this.logger.warn(
          `   ⚠️  SA_EMAIL or SA_PWD not configured - super admin not created`,
        );
        return;
      }

      // Validar y limpiar variables de entorno
      const cleanEmail = saEmail.trim();
      const cleanPwd = saPwd.trim();

      if (!cleanEmail || !cleanPwd) {
        this.logger.warn(
          `   ⚠️  SA_EMAIL or SA_PWD are empty after trimming - super admin not created`,
        );
        return;
      }

      this.logger.log(
        `📝 Creating super admin with email: ${cleanEmail}`,
      );

      // Hash de la contraseña usando el servicio de usuarios
      const passwordHash = await this.usersService.hashPassword(cleanPwd);

      // Crear el usuario super admin
      const superAdminUser = await this.userModel.create({
        email: cleanEmail,
        fullname: 'System Administrator',
        idNumber: 'SA-SYSTEM-0001',
        phone: '+1-000-0000', // Teléfono de sistema con formato
        phoneConfirmed: true, // Confirmado automáticamente
        roleKey: 'super_admin',
        passwordHash,
        status: 'active',
        isSystemAdmin: true,
        metadata: {
          source: 'system-bootstrap',
          createdAt: new Date().toISOString(),
        },
      });

      this.logger.log(
        `✅ PHASE 3 completed: Super admin user created successfully (email: ${cleanEmail}, id: ${superAdminUser.id})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error during PHASE 3: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

