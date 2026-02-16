import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SystemBootstrapService } from './system-bootstrap.service';
import { ModuleSchema } from 'src/modules/modules/infrastructure/schemas/module.schema';
import { RoleSchema } from 'src/modules/roles/infrastructure/schemas/role.schema';
import { UserSchema } from 'src/modules/users/infrastructure/schemas/user.schema';
import { UsersModule } from 'src/modules/users/users.module';

/**
 * BootstrapModule - Módulo de inicialización del sistema
 *
 * Responsabilidades:
 * - Registrar modelos necesarios para bootstrap (reutilizando esquemas de otros módulos)
 * - Exportar SystemBootstrapService para que sea inyectable en otros módulos
 * - Ejecutar inicialización en OnModuleInit
 *
 * Debe ser importado DESPUÉS de que ConfigModule esté disponible
 * (los otros módulos que definen esquemas se cargarán después según el orden de imports en AppModule)
 *
 * Nota: Los permisos (SYSTEM_PERMISSIONS) se resuelven dinámicamente desde los roles,
 * no se almacenan en una colección separada
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Module', schema: ModuleSchema },
      { name: 'Role', schema: RoleSchema },
      { name: 'User', schema: UserSchema },
    ]),
    UsersModule,
  ],
  providers: [SystemBootstrapService],
  exports: [SystemBootstrapService],
})
export class BootstrapModule {}
