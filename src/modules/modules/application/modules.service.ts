import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { CacheService } from 'src/common/cache/cache.service';

import { ModulesRepository } from '../infrastructure/adapters';

import {
  ModuleCreatedEvent,
  ModuleDisabledEvent,
  ModuleUpdatedEvent,
  NavigationCacheInvalidatedEvent,
  ModulesReorderedEvent,
} from '../events';

import { ModuleEntity, Permission } from '../domain/module.entity';

import { CreateModuleDto, UpdateModuleDto, ReorderModulesDto } from '../dto';

import { ApiResponse } from 'src/common/types/api-response.type';

/**
 * ModulesService - Servicio de aplicación para gestión de módulos
 * Responsable de:
 * - CRUD de módulos
 * - Generación automática de permisos a partir de acciones
 * - Caché de módulos (60s TTL)
 * - Emitir eventos de dominio
 * - Auditoría end-to-end de operaciones
 * - Invalidar caché de navegación al cambiar módulos
 */
@Injectable()
export class ModulesService {
  private readonly logger = new Logger(ModulesService.name);
  private readonly NAVIGATION_CACHE_KEY = 'navigation:items';

  /**
   * Caché de módulos con TTL de 60 segundos
   */
  private modulesCache: ModuleEntity[] | null = null;
  private modulesCacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 segundos

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2,
    private readonly modulesRepository: ModulesRepository,
  ) {}

  /**
   * Crear un nuevo módulo
   * - Normaliza datos
   * - Genera permissions[] automáticamente a partir de actions[]
   * - Emite ModuleCreatedEvent
   * - Invalida caché
   */
  async create(
    createModuleDto: CreateModuleDto,
  ): Promise<ApiResponse<ModuleEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    try {
      this.logger.log(
        `Creando módulo: ${createModuleDto.indicator}`,
        requestId,
      );

      // Validar que el módulo no exista
      const existing = await this.modulesRepository.findByIndicator(
        createModuleDto.indicator,
      );
      if (existing) {
        const message = `El módulo con indicador '${createModuleDto.indicator}' ya existe`;
        this.logger.warn(message);

        // Auditar intento de crear módulo duplicado
        this.auditService.logError(
          'MODULE_CREATED',
          'module',
          createModuleDto.indicator,
          new Error(message),
          {
            module: 'modules',
            severity: 'HIGH',
            tags: ['module', 'creation', 'duplicate', 'error'],
          },
        );

        return ApiResponse.fail<ModuleEntity>(
          HttpStatus.BAD_REQUEST,
          'MODULE_ALREADY_EXISTS',
          message,
          { requestId },
        );
      }

      // Normalizar y generar permissions a partir de actions
      const permissions = this.generatePermissions(
        createModuleDto.indicator,
        createModuleDto.actions,
        createModuleDto.name,
      );

      const module = new ModuleEntity({
        indicator: createModuleDto.indicator.toLowerCase().trim(),
        name: createModuleDto.name,
        parent: createModuleDto.parent ?? '',
        description: createModuleDto.description,
        icon: createModuleDto.icon,
        actions: createModuleDto.actions.map((a) => a.toLowerCase().trim()),
        permissions,
        status: 'active',
        isSystem: createModuleDto.isSystem || false,
        order: createModuleDto.order ?? 0,
        type: createModuleDto.type,
      });

      const created = await this.modulesRepository.create(module);
      this.logger.log(`Módulo creado: ${created.indicator}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar creación exitosa
      this.auditService.logAllow('MODULE_CREATED', 'module', created.id, {
        module: 'modules',
        severity: 'HIGH',
        tags: ['module', 'creation', 'security'],
        changes: {
          after: {
            id: created.id,
            indicator: created.indicator,
            name: created.name,
            actions: created.actions,
            permissions: created.permissions.length,
            isSystem: created.isSystem,
            status: created.status,
          },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'modules.module_created',
        new ModuleCreatedEvent(created, requestId),
      );

      return ApiResponse.ok<ModuleEntity>(
        HttpStatus.CREATED,
        created,
        'Módulo creado exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al crear módulo: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_CREATED',
        'module',
        createModuleDto.indicator,
        error as Error,
        {
          module: 'modules',
          severity: 'HIGH',
          tags: ['module', 'creation', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al crear módulo',
        { requestId },
      );
    }
  }

  /**
   * Obtener todos los módulos activos (con caché 60s)
   */
  async findAll(): Promise<ApiResponse<ModuleEntity[]>> {
    const requestId = 'findAll';
    try {
      const now = Date.now();
      const isCached =
        this.modulesCache &&
        now - this.modulesCacheTimestamp < this.CACHE_TTL_MS;

      // Retornar desde caché si está válido
      if (isCached) {
        this.logger.log('Retornando módulos desde caché');

        // Fire-and-forget: Auditar lectura desde caché
        this.auditService.logAllow('MODULE_READ_ALL', 'modules', 'all', {
          module: 'modules',
          severity: 'LOW',
          tags: ['modules', 'read', 'cache'],
          changes: {
            after: {
              cached: true,
              count: this.modulesCache!.length,
            },
          },
        });

        return ApiResponse.ok<ModuleEntity[]>(
          HttpStatus.OK,
          this.modulesCache!,
          'Módulos obtenidos exitosamente',
          { requestId, cached: true },
        );
      }

      // Consultar base de datos
      const modules = await this.modulesRepository.findAll();

      // Actualizar caché
      this.modulesCache = modules;
      this.modulesCacheTimestamp = now;

      // Fire-and-forget: Auditar lectura desde DB
      this.auditService.logAllow('MODULE_READ_ALL', 'modules', 'all', {
        module: 'modules',
        severity: 'LOW',
        tags: ['modules', 'read', 'database'],
        changes: {
          after: {
            cached: false,
            count: modules.length,
          },
        },
      });

      return ApiResponse.ok<ModuleEntity[]>(
        HttpStatus.OK,
        modules,
        'Módulos obtenidos exitosamente',
        { requestId, cached: false },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al obtener módulos: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_READ_ALL',
        'modules',
        'all',
        error as Error,
        {
          module: 'modules',
          severity: 'MEDIUM',
          tags: ['modules', 'read', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener módulos',
        { requestId },
      );
    }
  }

  /**
   * Obtener módulo por ID
   */
  async findById(id: string): Promise<ApiResponse<ModuleEntity>> {
    const requestId = `findById-${id}`;
    try {
      const module = await this.modulesRepository.findById(id);
      if (!module) {
        const message = `Módulo con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar lectura fallida
        this.auditService.logError(
          'MODULE_READ_BY_ID',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'LOW',
            tags: ['module', 'read', 'not-found'],
          },
        );

        return ApiResponse.fail<ModuleEntity>(
          HttpStatus.NOT_FOUND,
          'MODULE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      // Fire-and-forget: Auditar lectura exitosa
      this.auditService.logAllow('MODULE_READ_BY_ID', 'module', module.id, {
        module: 'modules',
        severity: 'LOW',
        tags: ['module', 'read'],
        changes: {
          after: {
            id: module.id!,
            indicator: module.indicator,
            status: module.status,
          },
        },
      });

      return ApiResponse.ok<ModuleEntity>(
        HttpStatus.OK,
        module,
        'Módulo obtenido exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al obtener módulo: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_READ_BY_ID',
        'module',
        id,
        error as Error,
        {
          module: 'modules',
          severity: 'MEDIUM',
          tags: ['module', 'read', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener módulo',
        { requestId },
      );
    }
  }

  /**
   * Obtener módulo por indicador (interno - no retorna ApiResponse)
   */
  private async findByIndicatorInternal(
    indicator: string,
  ): Promise<ModuleEntity | null> {
    return this.modulesRepository.findByIndicator(indicator);
  }

  /**
   * Obtener módulo por indicador (público - retorna ApiResponse)
   */
  async findByIndicator(indicator: string): Promise<ApiResponse<ModuleEntity>> {
    const requestId = `findByIndicator-${indicator}`;
    try {
      const module = await this.modulesRepository.findByIndicator(indicator);
      if (!module) {
        const message = `Módulo con indicador '${indicator}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar lectura fallida
        this.auditService.logError(
          'MODULE_READ_BY_INDICATOR',
          'module',
          indicator,
          new Error(message),
          {
            module: 'modules',
            severity: 'LOW',
            tags: ['module', 'read', 'not-found'],
          },
        );

        return ApiResponse.fail<ModuleEntity>(
          HttpStatus.NOT_FOUND,
          'MODULE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      // Fire-and-forget: Auditar lectura exitosa
      this.auditService.logAllow(
        'MODULE_READ_BY_INDICATOR',
        'module',
        module.id,
        {
          module: 'modules',
          severity: 'LOW',
          tags: ['module', 'read'],
          changes: {
            after: {
              id: module.id!,
              indicator: module.indicator,
              status: module.status,
            },
          },
        },
      );

      return ApiResponse.ok<ModuleEntity>(
        HttpStatus.OK,
        module,
        'Módulo obtenido exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al obtener módulo: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_READ_BY_INDICATOR',
        'module',
        indicator,
        error as Error,
        {
          module: 'modules',
          severity: 'MEDIUM',
          tags: ['module', 'read', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener módulo',
        { requestId },
      );
    }
  }

  /**
   * Actualizar un módulo
   * - Regenera permissions[] pero preserva enabled y requiresSuperAdmin de permisos existentes
   * - Emite ModuleUpdatedEvent
   * - Invalida caché
   */
  async update(
    id: string,
    updateModuleDto: UpdateModuleDto,
  ): Promise<ApiResponse<ModuleEntity>> {
    const requestId = this.asyncContextService.getRequestId();
    try {
      this.logger.log(`Actualizando módulo: ${id}`, requestId);

      const existingResponse = await this.findById(id);
      if (!existingResponse.ok || !existingResponse.data) {
        return ApiResponse.fail<ModuleEntity>(
          existingResponse.statusCode,
          existingResponse.errors || 'Unknown error',
          existingResponse.message,
          { requestId },
        );
      }

      const existing = existingResponse.data;

      // Validar que no se intente cambiar indicador de módulo del sistema
      if (
        existing.isSystem &&
        updateModuleDto.indicator &&
        updateModuleDto.indicator !== existing.indicator
      ) {
        const message = `No se puede cambiar el indicador de un módulo del sistema`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error de validación
        this.auditService.logError(
          'MODULE_UPDATED',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'HIGH',
            tags: ['module', 'update', 'validation-error'],
          },
        );

        return ApiResponse.fail<ModuleEntity>(
          HttpStatus.BAD_REQUEST,
          'SYSTEM_MODULE_CANNOT_CHANGE_INDICATOR',
          message,
          { requestId },
        );
      }

      // Regenerar permissions si las acciones cambian
      let permissions = existing.permissions;
      if (updateModuleDto.actions) {
        const newActions = updateModuleDto.actions.map((a) =>
          a.toLowerCase().trim(),
        );
        const newIndicator =
          updateModuleDto.indicator?.toLowerCase().trim() || existing.indicator;
        const newName = updateModuleDto.name || existing.name;

        permissions = this.generatePermissionsWithMerge(
          newIndicator,
          newActions,
          newName,
          existing.permissions,
        );
      }

      const updated = await this.modulesRepository.update(id, {
        ...updateModuleDto,
        indicator: updateModuleDto.indicator?.toLowerCase().trim(),
        actions: updateModuleDto.actions?.map((a) => a.toLowerCase().trim()),
        permissions,
      });

      if (!updated) {
        const message = `Módulo con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error
        this.auditService.logError(
          'MODULE_UPDATED',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'HIGH',
            tags: ['module', 'update', 'not-found'],
          },
        );

        return ApiResponse.fail<ModuleEntity>(
          HttpStatus.NOT_FOUND,
          'MODULE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      this.logger.log(`Módulo actualizado: ${updated.indicator}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar actualización exitosa con cambios
      this.auditService.logAllow('MODULE_UPDATED', 'module', updated.id, {
        module: 'modules',
        severity: 'HIGH',
        tags: ['module', 'update', 'security'],
        changes: {
          before: {
            indicator: existing.indicator,
            name: existing.name,
            actions: existing.actions,
            permissions: existing.permissions.length,
            status: existing.status,
          },
          after: {
            indicator: updated.indicator,
            name: updated.name,
            actions: updated.actions,
            permissions: updated.permissions.length,
            status: updated.status,
          },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'modules.module_updated',
        new ModuleUpdatedEvent(updated, existing, requestId),
      );

      return ApiResponse.ok<ModuleEntity>(
        HttpStatus.OK,
        updated,
        'Módulo actualizado exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al actualizar módulo: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_UPDATED',
        'module',
        id,
        error as Error,
        {
          module: 'modules',
          severity: 'HIGH',
          tags: ['module', 'update', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar módulo',
        { requestId },
      );
    }
  }

  /**
   * Deshabilitar un módulo (soft-delete)
   * Emite ModuleDisabledEvent
   */
  async disable(
    id: string,
    correlationId?: string,
  ): Promise<ApiResponse<ModuleEntity>> {
    const requestId = correlationId || `disable-${id}`;
    try {
      this.logger.log(`Deshabilitando módulo: ${id}`, requestId);

      const existingResponse = await this.findById(id);
      if (!existingResponse.ok || !existingResponse.data) {
        return ApiResponse.fail<ModuleEntity>(
          existingResponse.statusCode,
          existingResponse.errors || 'Unknown error',
          existingResponse.message,
          { requestId },
        );
      }

      const existing = existingResponse.data;

      // No permitir deshabilitar módulos del sistema
      if (existing.isSystem) {
        const message = `No se puede deshabilitar un módulo del sistema`;
        this.logger.warn(
          `Intento de deshabilitar módulo del sistema: ${existing.indicator}`,
        );

        // Fire-and-forget: Auditar intento fallido
        this.auditService.logError(
          'MODULE_DISABLED',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'HIGH',
            tags: ['module', 'disable', 'system-module', 'forbidden'],
          },
        );

        return ApiResponse.fail<ModuleEntity>(
          HttpStatus.BAD_REQUEST,
          'CANNOT_DISABLE_SYSTEM_MODULE',
          message,
          { requestId },
        );
      }

      const updated = await this.modulesRepository.disable(id);
      if (!updated) {
        const message = `Módulo con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error
        this.auditService.logError(
          'MODULE_DISABLED',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'HIGH',
            tags: ['module', 'disable', 'not-found'],
          },
        );

        return ApiResponse.fail<ModuleEntity>(
          HttpStatus.NOT_FOUND,
          'MODULE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      this.logger.log(`Módulo deshabilitado: ${updated.indicator}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar deshabilitación exitosa
      this.auditService.logAllow('MODULE_DISABLED', 'module', updated.id, {
        module: 'modules',
        severity: 'HIGH',
        tags: ['module', 'disable', 'soft-delete'],
        changes: {
          before: {
            indicator: existing.indicator,
            status: existing.status,
          },
          after: {
            indicator: updated.indicator,
            status: updated.status,
          },
        },
      });

      // Emitir evento
      this.eventEmitter.emit(
        'modules.module_disabled',
        new ModuleDisabledEvent(id, updated.name, correlationId),
      );

      return ApiResponse.ok<ModuleEntity>(
        HttpStatus.OK,
        updated,
        'Módulo deshabilitado exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al deshabilitar módulo: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_DISABLED',
        'module',
        id,
        error as Error,
        {
          module: 'modules',
          severity: 'HIGH',
          tags: ['module', 'disable', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al deshabilitar módulo',
        { requestId },
      );
    }
  }

  /**
   * Eliminar un módulo (hard-delete)
   * Solo permitido si:
   * - No es módulo del sistema (isSystem = false)
   * - Ya está deshabilitado (status = disabled)
   */
  async hardDelete(
    id: string,
    correlationId?: string,
  ): Promise<ApiResponse<void>> {
    const requestId = correlationId || `delete-${id}`;
    try {
      this.logger.log(`Eliminando módulo (hard-delete): ${id}`, requestId);

      const existingResponse = await this.findById(id);
      if (!existingResponse.ok || !existingResponse.data) {
        return ApiResponse.fail<void>(
          existingResponse.statusCode,
          existingResponse.errors || 'Unknown error',
          existingResponse.message,
          { requestId },
        );
      }

      const existing = existingResponse.data;

      // Validar que no sea módulo del sistema
      if (existing.isSystem) {
        const message = `No se puede eliminar un módulo del sistema`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar intento fallido
        this.auditService.logError(
          'MODULE_DELETED',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'CRITICAL',
            tags: [
              'module',
              'delete',
              'system-module',
              'forbidden',
              'destructive',
            ],
          },
        );

        return ApiResponse.fail<void>(
          HttpStatus.BAD_REQUEST,
          'CANNOT_DELETE_SYSTEM_MODULE',
          message,
          { requestId },
        );
      }

      // Validar que esté deshabilitado
      if (existing.status !== 'disabled') {
        const message = `Solo se pueden eliminar módulos deshabilitados. Primero deshabilítalo.`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar intento fallido
        this.auditService.logError(
          'MODULE_DELETED',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'CRITICAL',
            tags: [
              'module',
              'delete',
              'not-disabled',
              'validation-error',
              'destructive',
            ],
          },
        );

        return ApiResponse.fail<void>(
          HttpStatus.BAD_REQUEST,
          'MODULE_MUST_BE_DISABLED',
          message,
          { requestId },
        );
      }

      const deleted = await this.modulesRepository.delete(id);
      if (!deleted) {
        const message = `Módulo con ID '${id}' no encontrado`;
        this.logger.warn(message);

        // Fire-and-forget: Auditar error
        this.auditService.logError(
          'MODULE_DELETED',
          'module',
          id,
          new Error(message),
          {
            module: 'modules',
            severity: 'CRITICAL',
            tags: ['module', 'delete', 'not-found', 'destructive'],
          },
        );

        return ApiResponse.fail<void>(
          HttpStatus.NOT_FOUND,
          'MODULE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      this.logger.log(`Módulo eliminado: ${existing.indicator}`);

      // Invalidar caché
      this.invalidateCache();

      // Fire-and-forget: Auditar eliminación exitosa (hard-delete)
      this.auditService.logAllow('MODULE_DELETED', 'module', id, {
        module: 'modules',
        severity: 'CRITICAL',
        tags: ['module', 'delete', 'hard-delete', 'destructive'],
        changes: {
          before: {
            id: existing._id!,
            indicator: existing.indicator,
            name: existing.name,
            status: existing.status,
          },
          after: {
            id: 'deleted',
            indicator: 'deleted',
            name: 'deleted',
            status: 'deleted',
          },
        },
      });

      return ApiResponse.ok<void>(
        HttpStatus.NO_CONTENT,
        undefined,
        'Módulo eliminado exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error al eliminar módulo: ${errorMsg}`, error);

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_DELETED',
        'module',
        id,
        error as Error,
        {
          module: 'modules',
          severity: 'CRITICAL',
          tags: ['module', 'delete', 'error', 'destructive'],
        },
      );

      return ApiResponse.fail<void>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al eliminar módulo',
        { requestId },
      );
    }
  }

  /**
   * Obtener módulos del sistema
   */
  async findSystemModules(): Promise<ApiResponse<ModuleEntity[]>> {
    const requestId = 'findSystemModules';
    try {
      const modules = await this.modulesRepository.findSystemModules();

      // Fire-and-forget: Auditar lectura de módulos del sistema
      this.auditService.logAllow('MODULE_READ_SYSTEM', 'modules', 'system', {
        module: 'modules',
        severity: 'LOW',
        tags: ['modules', 'read', 'system'],
        changes: {
          after: {
            count: modules.length,
            indicators: modules.map((m) => m.indicator),
          },
        },
      });

      return ApiResponse.ok<ModuleEntity[]>(
        HttpStatus.OK,
        modules,
        'Módulos del sistema obtenidos exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error al obtener módulos del sistema: ${errorMsg}`,
        error,
      );

      // Fire-and-forget: Auditar error
      this.auditService.logError(
        'MODULE_READ_SYSTEM',
        'modules',
        'system',
        error as Error,
        {
          module: 'modules',
          severity: 'MEDIUM',
          tags: ['modules', 'read', 'system', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener módulos del sistema',
        { requestId },
      );
    }
  }

  /**
   * Generar array de permisos a partir de acciones
   * Se ejecuta al crear un módulo
   */
  private generatePermissions(
    moduleIndicator: string,
    actions: string[],
    moduleName: string,
  ): Permission[] {
    const permissions: Permission[] = [];
    const seenIds = new Set<string>();

    for (const action of actions) {
      const normalized = action.toLowerCase().trim();
      const permissionId = this.generatePermissionId(
        moduleIndicator,
        normalized,
      );

      // Evitar duplicados
      if (seenIds.has(permissionId)) {
        continue;
      }

      seenIds.add(permissionId);

      permissions.push({
        id: permissionId,
        name: this.generatePermissionName(normalized),
        indicator: `${moduleIndicator}.${normalized}`,
        description: `Acción: ${normalized} en módulo ${moduleName}`,
        enabled: true,
        requiresSuperAdmin: false,
      });
    }

    return permissions;
  }

  /**
   * Regenerar permisos preservando valores de enabled y requiresSuperAdmin
   * Se ejecuta al actualizar acciones de un módulo
   */
  private generatePermissionsWithMerge(
    moduleIndicator: string,
    newActions: string[],
    moduleName: string,
    existingPermissions: Permission[],
  ): Permission[] {
    // Crear mapa de permisos existentes para referencia rápida
    const existingMap = new Map<string, Permission>();
    existingPermissions.forEach((p) => {
      existingMap.set(p.indicator, p);
    });

    const permissions: Permission[] = [];
    const seenIds = new Set<string>();

    for (const action of newActions) {
      const normalized = action.toLowerCase().trim();
      const indicator = `${moduleIndicator}.${normalized}`;
      const permissionId = this.generatePermissionId(
        moduleIndicator,
        normalized,
      );

      // Evitar duplicados
      if (seenIds.has(permissionId)) {
        continue;
      }

      seenIds.add(permissionId);

      // Si el permiso ya existe, preservar enabled, requiresSuperAdmin e icon
      const existing = existingMap.get(indicator);

      permissions.push({
        id: permissionId,
        name: existing?.name || this.generatePermissionName(normalized),
        indicator: indicator,
        description:
          existing?.description ||
          `Acción: ${normalized} en módulo ${moduleName}`,
        icon: existing?.icon,
        enabled: existing?.enabled ?? true,
        requiresSuperAdmin: existing?.requiresSuperAdmin ?? false,
      });
    }

    return permissions;
  }

  /**
   * Generar ID único para un permiso
   * Formato: primeras 2-3 letras del módulo + primeras 1-2 letras de la acción
   * Ej: "gateways" + "view" = "gw_v"
   */
  private generatePermissionId(
    moduleIndicator: string,
    action: string,
  ): string {
    const modulePart = moduleIndicator.substring(0, 2).toLowerCase();
    const actionPart = action.substring(0, 1).toLowerCase();
    return `${modulePart}_${actionPart}`;
  }

  /**
   * Generar nombre legible para un permiso a partir de la acción
   * Ej: "manage_secrets" -> "Manage Secrets"
   */
  private generatePermissionName(action: string): string {
    return action
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Invalidar caché
   */
  private invalidateCache(): void {
    this.modulesCache = null;
    this.modulesCacheTimestamp = 0;
    this.logger.log('Caché de módulos invalidado');
  }

  /**
   * Reordenar módulos dentro de una padre o a nivel superior
   * Recibe un único DTO con id, order y parent
   * - Obtiene todos los módulos con el mismo parent
   * - Reordena los módulos para que el indicado quede en la posición deseada
   * - Valida que los órdenes sean consecutivos (0, 1, 2, ...)
   */
  async reorderModules(dto: ReorderModulesDto): Promise<ApiResponse<ModuleEntity[]>> {
    const requestId = this.asyncContextService.getRequestId();
    try {
      this.logger.log(
        `Reordenando módulo: ${dto.id} con order: ${dto.order} (padre: ${dto.parent || 'top-level'})`,
        requestId,
      );

      // Validar que el módulo a reordenar existe
      const moduleToReorder = await this.modulesRepository.findById(dto.id);
      if (!moduleToReorder) {
        const message = `Módulo con ID '${dto.id}' no encontrado`;
        this.logger.warn(message);
        return ApiResponse.fail<ModuleEntity[]>(
          HttpStatus.NOT_FOUND,
          'MODULE_NOT_FOUND',
          message,
          { requestId },
        );
      }

      // Validar que el parent coincide (si se proporciona)
      const normalizedParent = (dto.parent || '').toLowerCase().trim();
      const moduleParent = (moduleToReorder.parent || '').toLowerCase().trim();

      if (normalizedParent !== moduleParent) {
        const message = `El módulo no pertenece al padre especificado`;
        this.logger.warn(message);
        return ApiResponse.fail<ModuleEntity[]>(
          HttpStatus.BAD_REQUEST,
          'PARENT_MISMATCH',
          message,
          { requestId },
        );
      }

      // Obtener todos los módulos con el mismo parent
      const allModules =
        await this.modulesRepository.findAllIncludingDisabled();
      const siblingModules = allModules.filter(
        (m) => (m.parent || '').toLowerCase().trim() === normalizedParent,
      );

      if (siblingModules.length === 0) {
        const message = `No se encontraron módulos con el padre especificado`;
        this.logger.warn(message);
        return ApiResponse.fail<ModuleEntity[]>(
          HttpStatus.NOT_FOUND,
          'SIBLINGS_NOT_FOUND',
          message,
          { requestId },
        );
      }

      // Validar que el order está dentro del rango válido
      if (dto.order < 0 || dto.order >= siblingModules.length) {
        const message = `El orden debe estar entre 0 y ${siblingModules.length - 1}`;
        this.logger.warn(message);
        return ApiResponse.fail<ModuleEntity[]>(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER',
          message,
          { requestId },
        );
      }

      // Reordenar: remover el módulo de su posición actual e insertarlo en la nueva
      const orderedSiblings = siblingModules
        .sort((a, b) => a.order - b.order)
        .filter((m) => m.id !== dto.id);

      orderedSiblings.splice(dto.order, 0, moduleToReorder);

      // Actualizar órdenes de todos los módulos afectados
      const updatePromises = orderedSiblings.map((module, index) => {
        if (module.order !== index) {
          module.order = index;
          return this.modulesRepository.update(module.id, { order: index });
        }
        return Promise.resolve(module);
      });

      const updatedModules = await Promise.all(updatePromises);
      const updatedModulesNonNull = updatedModules.filter(
        (m): m is ModuleEntity => m !== null,
      );

      this.logger.log(
        `Módulos reordenados exitosamente: ${updatedModulesNonNull.map((m) => m.indicator).join(', ')}`,
      );

      // Invalidar caché
      this.invalidateCache();
      await this.cacheService.delete(this.NAVIGATION_CACHE_KEY);

      // Fire-and-forget: Emitir evento de reordenamiento
      this.eventEmitter.emit(
        'modules.modules_reordered',
        new ModulesReorderedEvent(
          updatedModulesNonNull,
          normalizedParent || undefined,
          requestId,
        ),
      );

      // Fire-and-forget: Auditar
      this.auditService.logAllow(
        'MODULES_REORDERED',
        'modules',
        updatedModulesNonNull.map((m) => m.indicator).join(', '),
        {
          module: 'modules',
          tags: ['modules', 'reorder'],
          changes: {
            after: {
              reorderedModuleId: dto.id,
              newOrder: dto.order,
              parent: normalizedParent || 'top-level',
              affectedCount: updatedModulesNonNull.length,
            },
          },
        },
      );

      return ApiResponse.ok<ModuleEntity[]>(
        HttpStatus.OK,
        updatedModulesNonNull,
        'Módulos reordenados exitosamente',
        { requestId },
      );
    } catch (error: any) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error al reordenar módulos: ${message}`,
        error instanceof Error ? error.stack : '',
      );

      this.auditService.logError(
        'MODULES_REORDERED',
        'modules',
        'unknown',
        error instanceof Error ? error : new Error(message),
        {
          module: 'modules',
          severity: 'HIGH',
          tags: ['modules', 'reorder', 'error'],
        },
      );

      return ApiResponse.fail<ModuleEntity[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'REORDER_ERROR',
        'Error al reordenar módulos',
        { requestId },
      );
    }
  }

  /**
   * Listener: Módulos reordenados -> Invalidar caché de navegación
   */
  @OnEvent('modules.modules_reordered')
  async onModulesReordered(event: ModulesReorderedEvent): Promise<void> {
    this.logger.log(
      `Invalidando caché de navegación: módulos reordenados (padre: ${event.parent || 'top-level'})`,
    );
    await this.cacheService.delete(this.NAVIGATION_CACHE_KEY);
    this.eventEmitter.emit(
      'modules.navigation_cache_invalidated',
      new NavigationCacheInvalidatedEvent(
        'Modules reordered',
        event.correlationId,
      ),
    );
  }

  /**
   * Listener: Módulo creado -> Invalidar caché de navegación
   */
  @OnEvent('modules.module_created')
  async onModuleCreated(event: ModuleCreatedEvent): Promise<void> {
    this.logger.log(
      `Invalidando caché de navegación: módulo creado (${event.module.indicator})`,
    );
    await this.cacheService.delete(this.NAVIGATION_CACHE_KEY);
    this.eventEmitter.emit(
      'modules.navigation_cache_invalidated',
      new NavigationCacheInvalidatedEvent(
        'Module created',
        event.correlationId,
      ),
    );
  }

  /**
   * Listener: Módulo actualizado -> Invalidar caché de navegación
   */
  @OnEvent('modules.module_updated')
  async onModuleUpdated(event: ModuleUpdatedEvent): Promise<void> {
    this.logger.log(
      `Invalidando caché de navegación: módulo actualizado (${event.module.indicator})`,
    );
    await this.cacheService.delete(this.NAVIGATION_CACHE_KEY);
    this.eventEmitter.emit(
      'modules.navigation_cache_invalidated',
      new NavigationCacheInvalidatedEvent(
        'Module updated',
        event.correlationId,
      ),
    );
  }

  /**
   * Listener: Módulo deshabilitado -> Invalidar caché de navegación
   */
  @OnEvent('modules.module_disabled')
  async onModuleDisabled(event: ModuleDisabledEvent): Promise<void> {
    this.logger.log(
      `Invalidando caché de navegación: módulo deshabilitado (${event.moduleId})`,
    );
    await this.cacheService.delete(this.NAVIGATION_CACHE_KEY);
    this.eventEmitter.emit(
      'modules.navigation_cache_invalidated',
      new NavigationCacheInvalidatedEvent(
        'Module disabled',
        event.correlationId,
      ),
    );
  }
}
