import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthzModule } from '../authz/authz.module';
import { AuditModule } from '../audit/audit.module';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { UsersService } from './application/users.service';

import { UsersController } from './infrastructure/controllers/users.controller';
import { ProfileController } from './infrastructure/controllers/profile.controller';

import { MongoDbUsersRepository } from './infrastructure/adapters/mongodb-users.repository';

import { User, UserSchema } from './infrastructure/schemas/user.schema';

/**
 * Módulo de gestión de usuarios.
 *
 * Proporciona servicios CRUD y controladores REST para usuarios.
 * Todas las operaciones relacionadas con usuarios están centralizadas aquí.
 *
 * Servicios:
 * - UsersService: CRUD básico con validaciones y encapsulación de Argon2
 * - MongoDbUsersRepository: Adaptador MongoDB implementando patrón Repository
 *
 * Controladores:
 * - UsersController: Endpoints REST protegidos por JWT y permisos
 *   - POST /users - Crear usuario
 *   - GET /users - Listar usuarios
 *   - GET /users/:userId - Obtener usuario
 *   - POST /users/:userId/roles - Actualizar roles
 *   - POST /users/:userId/password - Cambiar contraseña
 *   - DELETE /users/:userId - Deshabilitar usuario
 *
 * Eventos:
 * - user.created: Emitido al crear usuario
 * - user.password_changed: Emitido al cambiar contraseña
 *
 * Exportaciones:
 * - UsersService: Para acceso desde otros módulos
 * - MongoDbUsersRepository: Para acceso desde otros módulos
 * - MongooseModule: Para extensiones de esquema
 *
 * Nota: Este módulo importa AuthzModule para acceso a PermissionsGuard.
 * AuthzModule solo importa el esquema User (no el módulo completo), evitando
 * dependencias circulares.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AuthzModule,
    AuditModule,
  ],
  controllers: [UsersController, ProfileController],
  providers: [AsyncContextService, UsersService, MongoDbUsersRepository],
  exports: [MongooseModule, UsersService, MongoDbUsersRepository],
})
export class UsersModule {}
