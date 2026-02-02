import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '../domain/role.entity';
import { RoleStatus } from '../domain/role.enums';
import { CreateRoleDto, UpdateRoleDto, UpdateRolePermissionsDto } from '../dto';
import {
  RoleCreatedEvent,
  RoleDisabledEvent,
  RoleUpdatedEvent,
  RolePermissionsUpdatedEvent,
} from '../events';
import { RolesRepository } from '../infrastructure/adapters';
import { ApiResponse } from 'src/common/types/api-response.type';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';

/**
 * RolesService - Servicio de aplicación para gestión de roles
 * Responsable de:
 * - CRUD de roles
 * - Validación y asignación de permisos
 * - Caché de roles (60s TTL)
 * - Emitir eventos de dominio
 * - Auditoría end-to-end de operaciones
 */
@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  /**
   * Caché de roles con TTL de 60 segundos
   */
  private rolesCache: Role[] | null = null;
  private rolesCacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 segundos

  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crear un nuevo rol
   * - Normaliza datos
   * - Valida que el rol no exista
   * - Emite RoleCreatedEvent
   * - Invalida caché
   */
  async create(createRoleDto: CreateRoleDto): Promise<ApiResponse<Role>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      this.logger.log(`Creando rol: ${createRoleDto.key}`, requestId);

      // Validar que el rol no exista
      const existing = await this.rolesRepository.findByKey(createRoleDto.key);
      if (existing) {
        const message = `El rol con clave '${createRoleDto.key}' ya existe`;
        this.logger.warn(message);

        // Auditar intento de crear rol duplicado
        this.auditService.logError(
          'ROLE_CREATED',
          'role',
          createRoleDto.key,
          new Error(message),
          {
            module: 'roles',
            severity: 'HIGH',
            tags: ['role', 'creation', 'duplicate', 'error'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.BAD_REQUEST,
          'ROLE_ALREADY_EXISTS',
          message,
          { requestId },
        );
      }

      const role = new Role({
        key: createRoleDto.key.toLowerCase().trim(),
        name: createRoleDto.name,
        icon: createRoleDto.icon,
        description: createRoleDto.description,
        permissionKeys: createRoleDto.permissionKeys,
        status: RoleStatus.ACTIVE,
        isSystem: false,
      });

      const created = await this.rolesRepository.create(role);
      this.logger.log(`Rol creado: ${created.key}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar creación exitosa
      this.auditService.logAllow('ROLE_CREATED', 'role', created.id, {
        module: 'roles',
        severity: 'HIGH',
        tags: ['role', 'creation', 'security'],
        actorId: userId,
        changes: {
          after: {
            id: created.id,
            key: created.key,
            name: created.name,
            permissionKeys: created.permissionKeys,
            isSystem: created.isSystem,
            status: created.status,
          },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'roles.role_created',
        new RoleCreatedEvent(created, requestId),
      );

      return ApiResponse.ok<Role>(
        HttpStatus.CREATED,
        created,
        'Rol creado exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al crear rol: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'ROLE_CREATED',
        'role',
        createRoleDto.key,
        error as Error,
        {
          module: 'roles',
          severity: 'HIGH',
          tags: ['role', 'creation', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Role>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al crear rol',
        { requestId },
      );
    }
  }

  /**
   * Obtener todos los roles activos (con caché 60s)
   */
  async findAll(): Promise<ApiResponse<Role[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      const now = Date.now();
      const isCached =
        this.rolesCache && now - this.rolesCacheTimestamp < this.CACHE_TTL_MS;

      // Retornar desde caché si está válido
      if (isCached) {
        this.logger.debug('Retornando roles desde caché');

        // Filtrar super_admin
        const filteredRoles = this.rolesCache!.filter(
          (r) => r.key !== 'super_admin',
        );

        // Fire-and-forget: Auditar lectura desde caché
        this.auditService.logAllow('ROLE_READ_ALL', 'roles', 'all', {
          module: 'roles',
          severity: 'LOW',
          tags: ['roles', 'read', 'cache'],
          actorId: userId,
          changes: {
            after: {
              cached: true,
              count: filteredRoles.length,
            },
          },
        });

        return ApiResponse.ok<Role[]>(
          HttpStatus.OK,
          filteredRoles,
          'Roles obtenidos exitosamente',
          { requestId, cached: true },
        );
      }

      // Consultar base de datos
      const roles = await this.rolesRepository.findAll();

      // Filtrar super_admin
      const filteredRoles = roles.filter((r) => r.key !== 'super_admin');

      // Actualizar caché con todos los roles (sin filtrar)
      this.rolesCache = roles;
      this.rolesCacheTimestamp = now;

      // Fire-and-forget: Auditar lectura desde DB
      this.auditService.logAllow('ROLE_READ_ALL', 'roles', 'all', {
        module: 'roles',
        severity: 'LOW',
        tags: ['roles', 'read', 'database'],
        actorId: userId,
        changes: {
          after: {
            cached: false,
            count: filteredRoles.length,
          },
        },
      });

      return ApiResponse.ok<Role[]>(
        HttpStatus.OK,
        filteredRoles,
        'Roles obtenidos exitosamente',
        { requestId, cached: false },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al obtener roles: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'ROLE_READ_ALL',
        'roles',
        'all',
        error as Error,
        {
          module: 'roles',
          severity: 'MEDIUM',
          tags: ['roles', 'read', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Role[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener roles',
        { requestId },
      );
    }
  }

  /**
   * Obtener rol por ID
   */
  async findById(id: string): Promise<ApiResponse<Role>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      const role = await this.rolesRepository.findById(id);
      if (!role) {
        const message = `Rol con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar lectura fallida
        this.auditService.logError(
          'ROLE_READ_BY_ID',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'LOW',
            tags: ['role', 'read', 'not-found'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.NOT_FOUND,
          'ROLE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      // Fire-and-forget: Auditar lectura exitosa
      this.auditService.logAllow('ROLE_READ_BY_ID', 'role', role.id, {
        module: 'roles',
        severity: 'LOW',
        tags: ['role', 'read'],
        actorId: userId,
        changes: {
          after: {
            id: role.id,
            key: role.key,
            status: role.status,
          },
        },
      });

      return ApiResponse.ok<Role>(
        HttpStatus.OK,
        role,
        'Rol obtenido exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al obtener rol: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'ROLE_READ_BY_ID',
        'role',
        id,
        error as Error,
        {
          module: 'roles',
          severity: 'MEDIUM',
          tags: ['role', 'read', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Role>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener rol',
        { requestId },
      );
    }
  }

  /**
   * Obtener rol por clave
   */
  async findByKey(key: string): Promise<ApiResponse<Role>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      const role = await this.rolesRepository.findByKey(key);
      if (!role) {
        const message = `Rol con clave '${key}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar lectura fallida
        this.auditService.logError(
          'ROLE_READ_BY_KEY',
          'role',
          key,
          new Error(message),
          {
            module: 'roles',
            severity: 'LOW',
            tags: ['role', 'read', 'not-found'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.NOT_FOUND,
          'ROLE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      // Fire-and-forget: Auditar lectura exitosa
      this.auditService.logAllow('ROLE_READ_BY_KEY', 'role', role.id, {
        module: 'roles',
        severity: 'LOW',
        tags: ['role', 'read'],
        actorId: userId,
        changes: {
          after: {
            id: role.id,
            key: role.key,
            status: role.status,
          },
        },
      });

      return ApiResponse.ok<Role>(
        HttpStatus.OK,
        role,
        'Rol obtenido exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al obtener rol: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'ROLE_READ_BY_KEY',
        'role',
        key,
        error as Error,
        {
          module: 'roles',
          severity: 'MEDIUM',
          tags: ['role', 'read', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Role>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener rol',
        { requestId },
      );
    }
  }

  /**
   * Actualizar un rol
   * - Emite RoleUpdatedEvent
   * - Invalida caché
   */
  async update(
    id: string,
    updateRoleDto: UpdateRoleDto,
  ): Promise<ApiResponse<Role>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      this.logger.log(`Actualizando rol: ${id}`, requestId);

      const existingResponse = await this.findById(id);
      if (!existingResponse.ok || !existingResponse.data) {
        return ApiResponse.fail<Role>(
          existingResponse.statusCode,
          existingResponse.errors || 'Unknown error',
          existingResponse.message,
          { requestId },
        );
      }

      const existing = existingResponse.data;

      // Validar que no se intente cambiar clave de rol del sistema
      if (existing.isSystem && updateRoleDto.description !== undefined) {
        // Solo permitir cambiar descripción en roles del sistema
      }

      const updated = await this.rolesRepository.update(id, {
        ...updateRoleDto,
        key: updateRoleDto.description ? existing.key : existing.key, // key es inmutable
      });

      if (!updated) {
        const message = `Rol con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error
        this.auditService.logError(
          'ROLE_UPDATED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'HIGH',
            tags: ['role', 'update', 'not-found'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.NOT_FOUND,
          'ROLE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      this.logger.log(`Rol actualizado: ${updated.key}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar actualización exitosa con cambios
      this.auditService.logAllow('ROLE_UPDATED', 'role', updated.id, {
        module: 'roles',
        severity: 'HIGH',
        tags: ['role', 'update', 'security'],
        actorId: userId,
        changes: {
          before: {
            key: existing.key,
            name: existing.name,
            permissionKeys: existing.permissionKeys,
            status: existing.status,
          },
          after: {
            key: updated.key,
            name: updated.name,
            permissionKeys: updated.permissionKeys,
            status: updated.status,
          },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'roles.role_updated',
        new RoleUpdatedEvent(updated, existing, requestId),
      );

      return ApiResponse.ok<Role>(
        HttpStatus.OK,
        updated,
        'Rol actualizado exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al actualizar rol: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError('ROLE_UPDATED', 'role', id, error as Error, {
        module: 'roles',
        severity: 'HIGH',
        tags: ['role', 'update', 'error'],
        actorId: userId,
      });

      return ApiResponse.fail<Role>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar rol',
        { requestId },
      );
    }
  }

  /**
   * Deshabilitar un rol (soft-delete)
   * Emite RoleDisabledEvent
   */
  async disable(id: string): Promise<ApiResponse<Role>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      this.logger.log(`Deshabilitando rol: ${id}`, requestId);

      const existingResponse = await this.findById(id);
      if (!existingResponse.ok || !existingResponse.data) {
        return ApiResponse.fail<Role>(
          existingResponse.statusCode,
          existingResponse.errors || 'Unknown error',
          existingResponse.message,
          { requestId },
        );
      }

      const existing = existingResponse.data;

      // No permitir deshabilitar roles del sistema
      if (existing.isSystem) {
        const message = `No se puede deshabilitar un rol del sistema`;
        this.logger.warn(
          `Intento de deshabilitar rol del sistema: ${existing.key}`,
        );

        // Fire-and-forget: Auditar intento fallido
        this.auditService.logError(
          'ROLE_DISABLED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'HIGH',
            tags: ['role', 'disable', 'system-role', 'forbidden'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.BAD_REQUEST,
          'CANNOT_DISABLE_SYSTEM_ROLE',
          message,
          { requestId },
        );
      }

      const updated = await this.rolesRepository.disable(id);
      if (!updated) {
        const message = `Rol con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error
        this.auditService.logError(
          'ROLE_DISABLED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'HIGH',
            tags: ['role', 'disable', 'not-found'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.NOT_FOUND,
          'ROLE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      this.logger.log(`Rol deshabilitado: ${updated.key}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar deshabilitación exitosa
      this.auditService.logAllow('ROLE_DISABLED', 'role', updated.id, {
        module: 'roles',
        severity: 'HIGH',
        tags: ['role', 'disable', 'soft-delete'],
        actorId: userId,
        changes: {
          before: {
            key: existing.key,
            status: existing.status,
          },
          after: {
            key: updated.key,
            status: updated.status,
          },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'roles.role_disabled',
        new RoleDisabledEvent(id, updated.name, requestId),
      );

      return ApiResponse.ok<Role>(
        HttpStatus.OK,
        updated,
        'Rol deshabilitado exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al deshabilitar rol: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError('ROLE_DISABLED', 'role', id, error as Error, {
        module: 'roles',
        severity: 'HIGH',
        tags: ['role', 'disable', 'error'],
        actorId: userId,
      });

      return ApiResponse.fail<Role>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al deshabilitar rol',
        { requestId },
      );
    }
  }

  /**
   * Eliminar un rol (hard-delete)
   * Solo permitido si no es rol del sistema y está deshabilitado
   */
  async hardDelete(id: string): Promise<ApiResponse<string>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      this.logger.log(`Eliminando rol (hard-delete): ${id}`, requestId);

      const existingResponse = await this.findById(id);
      if (!existingResponse.ok || !existingResponse.data) {
        return ApiResponse.fail<string>(
          existingResponse.statusCode,
          existingResponse.errors || 'Unknown error',
          existingResponse.message,
          { requestId },
        );
      }

      const existing = existingResponse.data;

      // Validar que no sea rol del sistema
      if (existing.isSystem) {
        const message = `No se puede eliminar un rol del sistema`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar intento fallido
        this.auditService.logError(
          'ROLE_DELETED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'CRITICAL',
            tags: ['role', 'delete', 'system-role', 'forbidden', 'destructive'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<string>(
          HttpStatus.BAD_REQUEST,
          'CANNOT_DELETE_SYSTEM_ROLE',
          message,
          { requestId },
        );
      }

      // Validar que esté deshabilitado
      if (existing.status !== RoleStatus.DISABLED) {
        const message = `Solo se pueden eliminar roles deshabilitados. Primero deshabilítalo.`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar intento fallido
        this.auditService.logError(
          'ROLE_DELETED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'CRITICAL',
            tags: [
              'role',
              'delete',
              'not-disabled',
              'validation-error',
              'destructive',
            ],
            actorId: userId,
          },
        );

        return ApiResponse.fail<string>(
          HttpStatus.BAD_REQUEST,
          'ROLE_MUST_BE_DISABLED',
          message,
          { requestId },
        );
      }

      const deleted = await this.rolesRepository.delete(id);
      if (!deleted) {
        const message = `Rol con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error
        this.auditService.logError(
          'ROLE_DELETED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'CRITICAL',
            tags: ['role', 'delete', 'not-found', 'destructive'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<string>(
          HttpStatus.NOT_FOUND,
          'ROLE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      this.logger.log(`Rol eliminado: ${existing.key}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar eliminación exitosa (hard-delete)
      this.auditService.logAllow('ROLE_DELETED', 'role', id, {
        module: 'roles',
        severity: 'CRITICAL',
        tags: ['role', 'delete', 'hard-delete', 'destructive'],
        actorId: userId,
        changes: {
          before: {
            id: existing.id,
            key: existing.key,
            name: existing.name,
            status: existing.status,
          },
          after: {
            id: 'deleted',
            key: 'deleted',
            name: 'deleted',
            status: 'deleted',
          },
        },
      });

      return ApiResponse.ok<string>(
        HttpStatus.NO_CONTENT,
        id,
        'Rol eliminado exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al eliminar rol: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError('ROLE_DELETED', 'role', id, error as Error, {
        module: 'roles',
        severity: 'CRITICAL',
        tags: ['role', 'delete', 'error', 'destructive'],
        actorId: userId,
      });

      return ApiResponse.fail<string>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al eliminar rol',
        { requestId },
      );
    }
  }

  /**
   * Obtener roles del sistema
   */
  async findSystemRoles(): Promise<ApiResponse<Role[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      const roles = await this.rolesRepository.findSystemRoles();

      // Fire-and-forget: Auditar lectura de roles del sistema
      this.auditService.logAllow('ROLE_READ_SYSTEM', 'roles', 'system', {
        module: 'roles',
        severity: 'LOW',
        tags: ['roles', 'read', 'system'],
        actorId: userId,
        changes: {
          after: {
            count: roles.length,
            keys: roles.map((r) => r.key),
          },
        },
      });

      return ApiResponse.ok<Role[]>(
        HttpStatus.OK,
        roles,
        'Roles del sistema obtenidos exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error al obtener roles del sistema: ${errorMsg}`,
        error,
      );

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'ROLE_READ_SYSTEM',
        'roles',
        'system',
        error as Error,
        {
          module: 'roles',
          severity: 'MEDIUM',
          tags: ['roles', 'read', 'system', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Role[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener roles del sistema',
        { requestId },
      );
    }
  }

  /**
   * Actualizar solo los permisos de un rol
   * - Emite RolePermissionsUpdatedEvent
   * - Invalida caché
   * - No permitir cambiar permisos en roles del sistema
   */
  async updatePermissions(
    id: string,
    updatePermissionsDto: UpdateRolePermissionsDto,
  ): Promise<ApiResponse<Role>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      this.logger.log(`Actualizando permisos del rol: ${id}`, requestId);

      const existingResponse = await this.findById(id);
      if (!existingResponse.ok || !existingResponse.data) {
        return ApiResponse.fail<Role>(
          existingResponse.statusCode,
          existingResponse.errors || 'Unknown error',
          existingResponse.message,
          { requestId },
        );
      }

      const existing = existingResponse.data;

      // Validar que no sea rol del sistema
      if (existing.key === 'super_admin') {
        const message = `No se pueden cambiar los permisos de un rol del sistema`;
        this.logger.warn(
          `Intento de cambiar permisos de rol del sistema: ${existing.key}`,
        );

        // Fire-and-forget: Auditar intento fallido
        this.auditService.logError(
          'ROLE_PERMISSIONS_UPDATED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'HIGH',
            tags: ['role', 'permissions', 'system-role', 'forbidden'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.BAD_REQUEST,
          'CANNOT_UPDATE_SYSTEM_ROLE_PERMISSIONS',
          message,
          { requestId },
        );
      }

      const updated = await this.rolesRepository.update(id, {
        permissionKeys: updatePermissionsDto.permissionKeys,
      });

      if (!updated) {
        const message = `Rol con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error
        this.auditService.logError(
          'ROLE_PERMISSIONS_UPDATED',
          'role',
          id,
          new Error(message),
          {
            module: 'roles',
            severity: 'HIGH',
            tags: ['role', 'permissions', 'update', 'not-found'],
            actorId: userId,
          },
        );

        return ApiResponse.fail<Role>(
          HttpStatus.NOT_FOUND,
          'ROLE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      this.logger.log(`Permisos del rol actualizados: ${updated.key}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar actualización exitosa con cambios de permisos
      this.auditService.logAllow(
        'ROLE_PERMISSIONS_UPDATED',
        'role',
        updated.id,
        {
          module: 'roles',
          severity: 'HIGH',
          tags: ['role', 'permissions', 'update', 'security'],
          actorId: userId,
          changes: {
            before: {
              permissionKeys: existing.permissionKeys,
            },
            after: {
              permissionKeys: updated.permissionKeys,
            },
          },
        },
      );

      // Emitir evento
      this.eventEmitter.emit(
        'roles.role_permissions_updated',
        new RolePermissionsUpdatedEvent(
          id,
          existing.permissionKeys,
          updated.permissionKeys,
          requestId,
        ),
      );

      return ApiResponse.ok<Role>(
        HttpStatus.OK,
        updated,
        'Permisos del rol actualizados exitosamente',
        { requestId },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error al actualizar permisos del rol: ${errorMsg}`,
        error,
      );

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'ROLE_PERMISSIONS_UPDATED',
        'role',
        id,
        error as Error,
        {
          module: 'roles',
          severity: 'HIGH',
          tags: ['role', 'permissions', 'update', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Role>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar permisos del rol',
        { requestId },
      );
    }
  }

  /**
   * Obtener roles activos por keys (para resolución de permisos)
   * - Devuelve roles activos con las keys especificadas
   * - Usado internamente por PermissionsService
   */
  async findActiveByKeys(roleKeys: string[]): Promise<Role[]> {
    if (roleKeys.length === 0) {
      return [];
    }

    try {
      return await this.rolesRepository.findByKeysAndStatus(
        roleKeys,
        RoleStatus.ACTIVE,
      );
    } catch (error) {
      this.logger.error(
        `Error al obtener roles activos por keys: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return [];
    }
  }

  /**
   * Invalidar caché
   */
  private invalidateCache(): void {
    this.rolesCache = null;
    this.rolesCacheTimestamp = 0;
    this.logger.debug('Caché de roles invalidado');
  }
}
