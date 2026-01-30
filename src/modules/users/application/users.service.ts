import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Model } from 'mongoose';

import * as argon2 from 'argon2';

import { MongoDbUsersRepository } from '../infrastructure/adapters/mongodb-users.repository';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from '../../audit/application/audit.service';

import type { IUsersService, UserDTO } from '../domain/ports/users.port';

import { UserCreatedEvent } from '../events/user-created.event';
import { UserPasswordChangedEvent } from '../events/user-password-changed.event';

import { User, UserDocument } from '../infrastructure/schemas/user.schema';

import { ApiResponse } from 'src/common/types/api-response.type';
import {
  CreateUserDto,
  UpdatePasswordDto,
  UpdateUserRolesDto,
  UpdateUserDto,
} from '../dto';

/**
 * Servicio de gestión de usuarios.
 *
 * Implementa:
 * - CRUD de usuarios con ApiResponse pattern
 * - Hashing de contraseñas con Argon2
 * - Auditoría end-to-end de todas las operaciones
 * - Emisión de eventos de dominio
 *
 * NOTA: La creación del super_admin es responsabilidad de SystemBootstrapService
 * que se ejecuta en el ciclo de inicialización de NestJS
 */
@Injectable()
export class UsersService implements IUsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private eventEmitter: EventEmitter2,
    private usersRepository: MongoDbUsersRepository,
    private asyncContextService: AsyncContextService,
    private auditService: AuditService,
  ) {}

  /**
   * Crear nuevo usuario.
   *
   * Implementa auditoría end-to-end:
   * - Extrae userId del JWT (contexto)
   * - Genera ID único para el nuevo usuario
   * - Hash de la contraseña
   * - Validación de unicidad
   * - Persistencia en BD
   * - Registro de auditoría (ALLOW)
   * - Emisión de evento de dominio
   */
  async create(dto: CreateUserDto): Promise<ApiResponse<UserDTO>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    try {
      this.logger.log(
        `[${requestId}] Creating user with roleKey: ${dto.roleKey}`,
      );

      // Hash de la contraseña
      const passwordHash = await this.hashPassword(dto.password);

      // Crear el usuario
      const user = await this.usersRepository.create({
        ...dto,
        userId,
        passwordHash,
      });

      const userDto = this.mapToDTO(user);

      // Auditoría: operación exitosa
      this.auditService.logAllow('USER_CREATED', 'user', userId, {
        module: 'users',
        severity: 'HIGH',
        tags: ['user', 'creation', 'security'],
        changes: {
          after: {
            id: user.id,
            email: user.email,
            fullname: user.fullname,
            roleKey: user.roleKey,
            status: user.status,
            userId: userId,
          },
        },
      });

      // Emitir evento de dominio
      this.eventEmitter.emit(
        'user.created',
        new UserCreatedEvent(userId, userDto.email || userDto.id),
      );

      this.logger.log(`[${requestId}] User created successfully: ${user.id}`);
      return ApiResponse.ok<UserDTO>(
        HttpStatus.CREATED,
        userDto,
        'Usuario creado exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to create user: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Auditoría: error en operación
      this.auditService.logError(
        'USER_CREATE_FAILED',
        'user',
        userId,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'HIGH',
          tags: ['user', 'creation', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error interno al crear usuario',
        { requestId },
      );
    }
  }

  /**
   * Obtener usuario por ID.
   *
   * Auditoría: registro de acceso con resultado (ALLOW/DENY)
   */
  async findById(id: string): Promise<ApiResponse<UserDTO | null>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    try {
      this.logger.debug(`[${requestId}] Fetching user by ID: ${id}`);
      const user = await this.usersRepository.findById(id);

      if (!user) {
        this.logger.debug(`[${requestId}] User not found: ${id}`);
        this.auditService.logDeny(
          'USER_READ_NOT_FOUND',
          'user',
          userId,
          'User not found',
          {
            module: 'users',
            severity: 'LOW',
            tags: ['user', 'read'],
          },
        );
        return ApiResponse.ok<UserDTO | null>(HttpStatus.OK, null, undefined, {
          requestId,
        });
      }

      const dto = this.mapToDTO(user);
      this.auditService.logAllow('USER_READ', 'user', userId, {
        module: 'users',
        severity: 'LOW',
        tags: ['user', 'read'],
      });

      return ApiResponse.ok<UserDTO>(HttpStatus.OK, dto, undefined, {
        requestId,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to find user by ID: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USER_READ_FAILED',
        'user',
        userId,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'MEDIUM',
          tags: ['user', 'read', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener usuario',
        { requestId },
      );
    }
  }

  /**
   * Obtener usuario por email.
   *
   * Auditoría: registro de búsqueda por email
   * - userId: identificador del actor que realiza la búsqueda (del contexto JWT)
   * - email: parámetro de búsqueda
   */
  async findByEmail(email: string): Promise<ApiResponse<UserDTO | null>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    try {
      this.logger.debug(`[${requestId}] Fetching user by email: ${email}`);
      const user = await this.usersRepository.findByEmail(email);

      if (!user) {
        this.logger.debug(`[${requestId}] User not found by email: ${email}`);
        this.auditService.logDeny(
          'USER_FIND_BY_EMAIL_NOT_FOUND',
          'user',
          userId,
          'User not found by email',
          {
            module: 'users',
            severity: 'LOW',
            tags: ['user', 'read', 'email_lookup'],
          },
        );
        return ApiResponse.ok<UserDTO | null>(HttpStatus.OK, null, undefined, {
          requestId,
        });
      }

      const dto = this.mapToDTO(user);
      this.auditService.logAllow('USER_FIND_BY_EMAIL', 'user', userId, {
        module: 'users',
        severity: 'LOW',
        tags: ['user', 'read', 'email_lookup'],
      });
      return ApiResponse.ok<UserDTO>(HttpStatus.OK, dto, undefined, {
        requestId,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to find user by email: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USER_FIND_BY_EMAIL_FAILED',
        'user',
        email,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'MEDIUM',
          tags: ['user', 'read', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener usuario por email',
        { requestId },
      );
    }
  }

  /**
   * Listar todos los usuarios activos.
   *
   * NOTA: El usuario super_admin nunca se devuelve en esta lista (es sistema, oculto)
   *
   * Auditoría: registro de listado
   */
  async list(): Promise<ApiResponse<UserDTO[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    try {
      this.logger.debug(`[${requestId}] Listing all users`);
      const users = await this.usersRepository.findAll();

      // Filtrar y excluir al usuario super_admin (sistema, oculto)
      const filteredUsers = users.filter((u) => u.roleKey !== 'super_admin');

      const dtos = filteredUsers.map((u) => this.mapToDTO(u));

      this.auditService.logAllow('USERS_LIST', 'users', userId, {
        module: 'users',
        severity: 'LOW',
        tags: ['users', 'list'],
        response: {
          count: dtos.length,
        },
      });

      return ApiResponse.ok<UserDTO[]>(HttpStatus.OK, dtos, undefined, {
        requestId,
        count: dtos.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to list users: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USERS_LIST_FAILED',
        'users',
        'all',
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'MEDIUM',
          tags: ['users', 'list', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al listar usuarios',
        { requestId },
      );
    }
  }

  /**
   * Actualizar rol de usuario (UN SOLO ROL).
   *
   * Auditoría end-to-end:
   * - Validación de existencia
   * - Registro de cambios antes/después
   * - Emisión de evento de dominio
   */
  async updateRoles(
    id: string,
    dto: UpdateUserRolesDto,
  ): Promise<ApiResponse<UserDTO>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;

    try {
      this.logger.log(`[${requestId}] Updating role for user: ${id}`);

      const beforeUser = await this.usersRepository.findById(id);
      if (!beforeUser) {
        this.logger.warn(`[${requestId}] User not found: ${id}`);
        this.auditService.logDeny(
          'USER_UPDATE_ROLE_NOT_FOUND',
          'user',
          userId,
          'User not found',
          {
            module: 'users',
            severity: 'MEDIUM',
            tags: ['user', 'update_role'],
          },
        );

        return ApiResponse.fail<UserDTO>(
          HttpStatus.NOT_FOUND,
          'User not found',
          `Usuario '${id}' no encontrado`,
          { requestId },
        );
      }

      const user = await this.usersRepository.updateRoles(id, dto);

      // Auditoría: cambios realizados
      this.auditService.logAllow('USER_ROLE_UPDATED', 'user', userId, {
        module: 'users',
        severity: 'HIGH',
        tags: ['user', 'update_role', 'security'],
        changes: {
          before: {
            roleKey: beforeUser.roleKey,
          },
          after: {
            roleKey: user?.roleKey,
          },
        },
      });

      this.logger.log(`[${requestId}] User role updated successfully: ${id}`);
      return ApiResponse.ok<UserDTO>(
        HttpStatus.OK,
        this.mapToDTO(user!),
        'Rol actualizado exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to update user role: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USER_ROLE_UPDATE_FAILED',
        'user',
        userId,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'HIGH',
          tags: ['user', 'update_role', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar rol de usuario',
        { requestId },
      );
    }
  }

  /**
   * Actualizar contraseña de usuario.
   *
   * Auditoría end-to-end:
   * - Validación de existencia
   * - Hash de la nueva contraseña
   * - Cambio de contraseña
   * - Emisión de evento de dominio
   * - Registro de auditoría (sin exponer la contraseña)
   */
  async updatePassword(
    id: string,
    dto: UpdatePasswordDto,
  ): Promise<ApiResponse<UserDTO>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    try {
      this.logger.log(`[${requestId}] Updating password for user: ${id}`);

      // Hash de la nueva contraseña
      const passwordHash = await this.hashPassword(dto.password);

      const user = await this.usersRepository.updatePassword(id, {
        passwordHash,
      });

      if (!user) {
        this.logger.warn(`[${requestId}] User not found: ${id}`);
        this.auditService.logDeny(
          'USER_PASSWORD_CHANGE_NOT_FOUND',
          'user',
          userId,
          'User not found',
          {
            module: 'users',
            severity: 'MEDIUM',
            tags: ['user', 'password_change'],
          },
        );

        return ApiResponse.fail<UserDTO>(
          HttpStatus.NOT_FOUND,
          'User not found',
          `Usuario '${id}' no encontrado`,
          { requestId },
        );
      }

      // Auditoría: cambio de contraseña (sin exponer la contraseña)
      this.auditService.logAllow('USER_PASSWORD_CHANGED', 'user', userId, {
        module: 'users',
        severity: 'CRITICAL',
        tags: ['user', 'password_change', 'security'],
        changes: {
          after: {
            passwordChanged: new Date(),
          },
        },
      });

      // Emitir evento de dominio
      this.eventEmitter.emit(
        'user.password_changed',
        new UserPasswordChangedEvent(user.id),
      );

      this.logger.log(
        `[${requestId}] User password updated successfully: ${id}`,
      );
      return ApiResponse.ok<UserDTO>(
        HttpStatus.OK,
        this.mapToDTO(user),
        'Contraseña actualizada exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to update user password: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USER_PASSWORD_CHANGE_FAILED',
        'user',
        userId,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'CRITICAL',
          tags: ['user', 'password_change', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar contraseña',
        { requestId },
      );
    }
  }

  /**
   * Actualizar datos del usuario (email, fullname, phone).
   *
   * Implementa auditoría end-to-end:
   * - Validación de existencia
   * - Actualización solo de campos permitidos
   * - Registro de cambios antes y después
   * - Auditoría de cambios
   */
  async update(id: string, dto: UpdateUserDto): Promise<ApiResponse<UserDTO>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;

    try {
      this.logger.log(`[${requestId}] Updating user data: ${id}`);

      const beforeUser = await this.usersRepository.findById(id);
      if (!beforeUser) {
        this.logger.warn(`[${requestId}] User not found: ${id}`);
        this.auditService.logDeny(
          'USER_UPDATE_NOT_FOUND',
          'user',
          userId,
          'User not found',
          {
            module: 'users',
            severity: 'MEDIUM',
            tags: ['user', 'update'],
          },
        );

        return ApiResponse.fail<UserDTO>(
          HttpStatus.NOT_FOUND,
          'User not found',
          `Usuario '${id}' no encontrado`,
          { requestId },
        );
      }

      const user = await this.usersRepository.updateUser(id, dto);

      // Auditoría: cambios realizados
      const changes: Record<string, any> = {};
      if (dto.email !== undefined && beforeUser.email !== dto.email) {
        changes.email = { before: beforeUser.email, after: dto.email };
      }
      if (dto.phone !== undefined && beforeUser.phone !== dto.phone) {
        changes.phone = { before: beforeUser.phone, after: dto.phone };
      }
      if (dto.fullname !== undefined && beforeUser.fullname !== dto.fullname) {
        changes.fullname = { before: beforeUser.fullname, after: dto.fullname };
      }

      this.auditService.logAllow('USER_DATA_UPDATED', 'user', userId, {
        module: 'users',
        severity: 'MEDIUM',
        tags: ['user', 'update', 'profile'],
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      });

      this.logger.log(`[${requestId}] User data updated successfully: ${id}`);
      return ApiResponse.ok<UserDTO>(
        HttpStatus.OK,
        this.mapToDTO(user!),
        'Datos de usuario actualizados exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to update user data: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USER_UPDATE_FAILED',
        'user',
        userId,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'MEDIUM',
          tags: ['user', 'update', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar datos de usuario',
        { requestId },
      );
    }
  }

  /**
   * Deshabilitar usuario (soft delete).
   *
   * Auditoría end-to-end:
   * - Validación de existencia
   * - Cambio de estado a 'inactive'
   * - Registro de auditoría
   */
  async disable(id: string): Promise<ApiResponse<void>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    try {
      this.logger.log(`[${requestId}] Disabling user: ${id}`);

      const success = await this.usersRepository.disable(id);

      if (!success) {
        this.logger.warn(`[${requestId}] User not found: ${id}`);
        this.auditService.logDeny(
          'USER_DISABLE_NOT_FOUND',
          'user',
          userId,
          'User not found',
          {
            module: 'users',
            severity: 'MEDIUM',
            tags: ['user', 'disable'],
          },
        );

        return ApiResponse.fail<void>(
          HttpStatus.NOT_FOUND,
          'User not found',
          `Usuario '${id}' no encontrado`,
          { requestId },
        );
      }

      // Auditoría: usuario deshabilitado
      this.auditService.logAllow('USER_DISABLED', 'user', userId, {
        module: 'users',
        severity: 'HIGH',
        tags: ['user', 'disable', 'security'],
        changes: {
          after: {
            status: 'inactive',
            disabledAt: new Date(),
          },
        },
      });

      this.logger.log(`[${requestId}] User disabled successfully: ${id}`);
      return ApiResponse.ok<void>(
        HttpStatus.NO_CONTENT,
        undefined,
        'Usuario deshabilitado exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to disable user: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USER_DISABLE_FAILED',
        'user',
        userId,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'HIGH',
          tags: ['user', 'disable', 'error'],
        },
      );

      return ApiResponse.fail<void>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al deshabilitar usuario',
        { requestId },
      );
    }
  }

  /**
   * Obtener documento raw (usado internamente).
   */
  async findByIdRaw(id: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ id }).exec();
  }

  /**
   * Hash de contraseña con Argon2.
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  /**
   * Verificar contraseña contra hash.
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      this.logger.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Mapear documento de usuario a DTO.
   */
  private mapToDTO(user: UserDocument): UserDTO {
    return {
      id: user.id,
      email: user.email,
      fullname: user.fullname,
      idNumber: user.idNumber,
      roleKey: user.roleKey,
      role: user.role,
      phone: user.phone,
      phoneConfirmed: user.phoneConfirmed,
      status: user.status,
      isSystemAdmin: user.isSystemAdmin,
      userId: user.userId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Busca un usuario por número de teléfono
   */
  async findByPhone(phone: string): Promise<ApiResponse<UserDTO | null>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    try {
      this.logger.debug(`[${requestId}] Fetching user by phone: ${phone}`);
      const user = await this.usersRepository.findByPhone(phone);

      if (!user) {
        this.logger.debug(`[${requestId}] User not found by phone: ${phone}`);
        this.auditService.logDeny(
          'USER_FIND_BY_PHONE_NOT_FOUND',
          'user',
          userId,
          'User not found by phone',
          {
            module: 'users',
            severity: 'LOW',
            tags: ['user', 'read', 'phone_lookup'],
          },
        );
        return ApiResponse.ok<UserDTO | null>(HttpStatus.OK, null, undefined, {
          requestId,
        });
      }

      const dto = this.mapToDTO(user);
      this.auditService.logAllow('USER_FIND_BY_PHONE', 'user', userId, {
        module: 'users',
        severity: 'LOW',
        tags: ['user', 'read', 'phone_lookup'],
      });
      return ApiResponse.ok<UserDTO>(HttpStatus.OK, dto, undefined, {
        requestId,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to find user by phone: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.auditService.logError(
        'USER_FIND_BY_PHONE_FAILED',
        'user',
        phone,
        error instanceof Error ? error : new Error(errorMsg),
        {
          module: 'users',
          severity: 'MEDIUM',
          tags: ['user', 'read', 'error'],
        },
      );

      return ApiResponse.fail<UserDTO>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener usuario por phone',
        { requestId },
      );
    }
  }

  /**
   * Verifica si un teléfono ya existe en la base de datos
   */
  async existsByPhone(phone: string): Promise<boolean> {
    try {
      const count = await this.userModel.countDocuments({ phone }).exec();
      return count > 0;
    } catch (error) {
      this.logger.error(`Error checking if phone exists ${phone}:`, error);
      return false;
    }
  }

  /**
   * Marca el teléfono de un usuario como confirmado
   */
  async markPhoneConfirmed(userId: string): Promise<void> {
    try {
      await this.userModel
        .findOneAndUpdate(
          { id: userId },
          { phoneConfirmed: true },
          { new: true },
        )
        .exec();

      this.logger.debug(`Phone confirmed for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error marking phone as confirmed for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Actualiza la contraseña de un usuario por teléfono
   */
  async updatePasswordByPhone(
    phone: string,
    passwordHash: string,
  ): Promise<void> {
    try {
      await this.userModel
        .findOneAndUpdate({ phone }, { passwordHash }, { new: true })
        .exec();

      this.logger.debug(`Password updated for user with phone ${phone}`);
    } catch (error) {
      this.logger.error(
        `Error updating password for user with phone ${phone}:`,
        error,
      );
      throw error;
    }
  }
}
