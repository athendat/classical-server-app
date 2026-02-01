import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpStatus } from '@nestjs/common';

import { v4 as uuidv4 } from 'uuid';

import { AsyncContextService } from '../../../common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { TenantVaultService } from '../infrastructure/services/tenant-vault.service';

import { TenantRepository } from '../infrastructure/adapters/tenant.repository';
import { TenantLifecycleRepository } from '../infrastructure/adapters/tenant-lifecycle.repository';

import { Tenant } from '../infrastructure/schemas/tenant.schema';

import {
  CreateTenantDto,
  UpdateTenantDto,
  TransitionTenantStateDto,
  TenantLifecyclePaginatedResponseDto,
  TenantLifecycleEventResponseDto,
} from '../dto';

import { isValidStateTransition } from '../domain/tenant.state-machine';

import { Actor } from 'src/common/interfaces';
import { ApiResponse } from 'src/common/types/api-response.type';
import { buildMongoQuery } from 'src/common/helpers';
import { PaginationMeta, QueryParams } from 'src/common/types';
import { TenantLifecycleEvent } from '../domain/interfaces/lifecycle-event.interface';
import { TenantStatus } from '../domain/enums';

/**
 * Servicio de aplicación para tenants
 * Orquesta la lógica de negocio para CRUD de tenants y transiciones de estado
 */
@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly asyncContextService: AsyncContextService,
    private readonly tenantRepository: TenantRepository,
    private readonly lifecycleRepository: TenantLifecycleRepository,
    private readonly vaultService: TenantVaultService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Crear un nuevo tenant
   * Valida PAN con Luhn (ya hecho en DTO), guarda en Vault, crea en DB con estado PENDING_REVIEW
   */
  async createTenant(dto: CreateTenantDto): Promise<ApiResponse<Tenant>> {
    // ⭐ OBTENER del contexto en lugar de generar
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    const actor = this.asyncContextService.getActor();
    try {
      this.logger.log(
        `[${requestId}] Creating tenant: businessName=${dto.businessName}`,
      );

      // Verificar si el email ya existe
      const existingTenant = await this.tenantRepository.findByEmail(dto.email);
      if (existingTenant) {
        const errorMsg = `Tenant already exists with email: ${dto.email}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<Tenant>(
          HttpStatus.CONFLICT,
          'El email ya está registrado como tenant',
          'Email duplicado',
        );
      }

      const tenantId = uuidv4();

      // Guardar PAN en Vault
      const savePanResult = await this.vaultService.savePan(
        tenantId, // Usar sub como ID temporal
        dto.pan,
      );

      if (savePanResult.isFailure) {
        this.logger.error('Failed to save PAN to Vault');
        return ApiResponse.fail<Tenant>(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Error al procesar datos de pago',
          'Error interno',
        );
      }

      const panVaultKeyId = savePanResult.getValue();

      // Crear tenant en MongoDB
      const tenantData = {
        id: tenantId,
        businessName: dto.businessName,
        legalRepresentative: dto.legalRepresentative,
        businessAddress: dto.businessAddress,
        panVaultKeyId,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        status: TenantStatus.PENDING_REVIEW,
        userId,
        notes: dto.notes,
      };

      const newTenant = await this.tenantRepository.create(tenantData);

      // Emitir evento de creación
      this.eventEmitter.emit('tenant.created', {
        tenantId: newTenant.id,
        businessName: newTenant.businessName,
        email: newTenant.email,
        userId,
        timestamp: new Date(),
      });

      // Crear evento de ciclo de vida inicial
      const lifecycleEvent: TenantLifecycleEvent = {
        tenantId: newTenant.id,
        fromState: TenantStatus.PENDING_REVIEW,
        toState: TenantStatus.PENDING_REVIEW,
        triggeredBy: {
          userId,
          username: actor?.sub || 'system',
          roleKey: actor?.scopes?.[0] || 'system',
        },
        comment: 'Tenant creado',
        timestamp: new Date(),
      };

      await this.lifecycleRepository.create(lifecycleEvent);

      // Retornar respuesta
      const responseDto = this.mapTenantToResponse(newTenant, undefined);

      return ApiResponse.ok<Tenant>(
        HttpStatus.CREATED,
        responseDto,
        'Tenant creado exitosamente',
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to create tenant: ${errorMsg}`,
        error,
      );

      this.auditService.logError(
        'TENANT_CREATED',
        'tenant',
        'unknown',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'tenants',
          severity: 'HIGH',
          tags: ['tenant', 'creation', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<Tenant>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error desconocido',
      );
    }
  }

  /**
   * Obtener un tenant por ID
   */
  async getTenantById(id: string): Promise<ApiResponse<Tenant>> {
    const requestId = this.asyncContextService.getRequestId();
    this.logger.debug(`[${requestId}] Fetching tenant by id: ${id}`);

    try {
      const tenant = await this.tenantRepository.findById(id);

      if (!tenant) {
        const errorMsg = `Tenant not found: ${id}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        // Registrar acceso denegado
        this.auditService.logDeny('TENANT_FETCHED', 'tenant', id, errorMsg, {
          severity: 'LOW',
          tags: ['tenant', 'read', 'not-found'],
        });
        return ApiResponse.fail<Tenant>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Tenant no encontrado',
          { requestId, id },
        );
      }
      // Registrar lectura exitosa
      const userId = this.asyncContextService.getActorId();
      this.auditService.logAllow('TENANT_FETCHED', 'tenant', id, {
        module: 'tenants',
        severity: 'LOW',
        tags: ['tenant', 'read', 'successful'],
        actorId: userId,
      });

      // Determinar si puede ver PAN desenmascarado
      const actor = this.asyncContextService.getActor();
      const canViewUnmasked = this.canViewSensitiveData(actor);
      let unmaskPan: string | undefined;

      if (canViewUnmasked) {
        const panResult = await this.vaultService.getPan(id);
        if (panResult.isSuccess) {
          unmaskPan = panResult.getValue();
        }
      }

      const responseDto = this.mapTenantToResponse(tenant, unmaskPan);

      return ApiResponse.ok<Tenant>(HttpStatus.OK, responseDto, undefined, {
        requestId,
        id,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const userId = this.asyncContextService.getActorId();
      this.logger.error(
        `[${requestId}] Failed to fetch tenant: ${errorMsg}`,
        error,
      );
      // Registrar error
      this.auditService.logError(
        'TENANT_FETCHED',
        'tenant',
        id,
        error instanceof Error ? error : new Error(errorMsg),
        {
          severity: 'MEDIUM',
          tags: ['tenant', 'read', 'error'],
          actorId: userId,
        },
      );
      return ApiResponse.fail<Tenant>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener tenant',
        { requestId, id },
      );
    }
  }

  /**
   * Listar tenants con paginación y filtros
   */
  async listTenants(queryParams: QueryParams): Promise<ApiResponse<Tenant[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    this.logger.debug(
      `[${requestId}] Fetching all tenants: page=${queryParams.page}, limit=${queryParams.limit}, search=${queryParams.search || 'none'}`,
    );

    try {
      // Campos permitidos para búsqueda
      const searchFields = [
        'businessName',
        'legalRepresentative',
        'email',
        'phone',
        'status',
      ];

      // Construir query de MongoDB
      const { mongoFilter, options } = buildMongoQuery(
        queryParams,
        searchFields,
      );

      this.logger.debug(
        `[${requestId}] MongoDB filter: ${JSON.stringify(mongoFilter)}`,
      );
      this.logger.debug(
        `[${requestId}] Query options: ${JSON.stringify(options)}`,
      );

      // Ejecutar consulta directamente en MongoDB
      const { data: tenants, total } = await this.tenantRepository.findAll(
        mongoFilter,
        options,
      );

      const limit = options.limit;
      const page = queryParams.page || 1;
      const totalPages = Math.ceil(total / limit);
      const skip = options.skip;
      const hasMore = skip + limit < total;

      this.logger.debug(
        `[${requestId}] Retrieved ${tenants.length} tenants from page ${page} (total: ${total})`,
      );

      // Registrar lectura exitosa
      this.auditService.logAllow('TENANT_LIST_FETCHED', 'tenant', 'list', {
        module: 'tenants',
        severity: 'LOW',
        tags: ['tenant', 'read', 'list', 'successful'],
        actorId: userId,
        changes: {
          after: {
            count: tenants.length,
            total,
            page,
            hasMore,
          },
        },
      });

      return ApiResponse.ok<Tenant[]>(
        HttpStatus.OK,
        tenants,
        `${tenants.length} de ${total} tenants encontradas`,
        {
          requestId,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasMore,
          } as PaginationMeta,
        },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to fetch tenants: ${errorMsg}`,
        error,
      );
      // Registrar error
      this.auditService.logError(
        'TENANT_LIST_FETCHED',
        'tenant',
        'list',
        error instanceof Error ? error : new Error(errorMsg),
        {
          severity: 'MEDIUM',
          tags: ['tenant', 'read', 'list', 'error'],
          actorId: userId,
        },
      );
      return ApiResponse.fail<Tenant[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener tenants',
        { requestId },
      );
    }
  }

  /**
   * Actualizar un tenant
   */
  async updateTenant(
    id: string,
    dto: UpdateTenantDto,
    actor: Actor,
  ): Promise<ApiResponse<Tenant>> {
    // ⭐ OBTENER del contexto
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    try {
      this.logger.log(`[${requestId}] Updating tenant: ${id}`);

      const tenant = await this.tenantRepository.findById(id);

      if (!tenant) {
        const errorMsg = `Tenant not found: ${id}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<Tenant>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Tenant no encontrada',
          { requestId },
        );
      }

      // Preparar datos a actualizar
      const updateData: any = { ...dto };

      // Si email cambió, verificar que no esté en uso
      if (dto.email && dto.email.toLowerCase() !== tenant.email) {
        const existingTenant = await this.tenantRepository.findByEmail(
          dto.email,
        );
        if (existingTenant) {
          return ApiResponse.fail<Tenant>(
            HttpStatus.CONFLICT,
            'El email ya está registrado',
            'Email duplicado',
          );
        }
        updateData.email = dto.email.toLowerCase();
      }

      // Preparar cambios
      const changes = Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined),
      );

      // Actualizar en BD
      const updated = await this.tenantRepository.update(id, updateData);

      this.logger.log(`[${requestId}] Tenant updated: ${id}`);

      // Registrar actualización exitosa
      this.auditService.logAllow('TENANT_UPDATED', 'tenant', id, {
        module: 'tenants',
        severity: 'MEDIUM',
        tags: ['tenant', 'update', 'successful'],
        actorId: userId,
        changes: {
          before: tenant,
          after: { ...changes, updatedBy: userId },
        },
      });

      // Emitir evento
      this.eventEmitter.emit('tenant.updated', {
        id,
        fieldsChanged: Object.keys(dto),
        updatedBy: actor.sub,
        timestamp: new Date(),
      });

      const responseDto = this.mapTenantToResponse(updated, undefined);

      return ApiResponse.ok<Tenant>(
        HttpStatus.OK,
        responseDto,
        'Tenant actualizado',
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to update tenant: ${errorMsg}`,
        error,
      );
      // Registrar error
      this.auditService.logError(
        'TENANT_UPDATED',
        'tenant',
        id,
        error instanceof Error ? error : new Error(errorMsg),
        {
          severity: 'HIGH',
          tags: ['tenant', 'update', 'error'],
          actorId: userId,
        },
      );
      return ApiResponse.fail<Tenant>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar tenant',
        { requestId },
      );
    }
  }

  /**
   * Cambiar el estado de un tenant (transición de máquina de estados)
   */
  async transitionTenantState(
    tenantId: string,
    dto: TransitionTenantStateDto,
    actor: Actor,
  ): Promise<ApiResponse<Tenant>> {
    try {
      const tenant = await this.tenantRepository.findById(tenantId);

      if (!tenant) {
        return ApiResponse.fail<Tenant>(
          HttpStatus.NOT_FOUND,
          'Tenant no encontrado',
          'No encontrado',
        );
      }

      const currentState = tenant.status;
      const targetState = dto.targetState;

      // Validar transición de estado
      if (!isValidStateTransition(currentState, targetState)) {
        return ApiResponse.fail<Tenant>(
          HttpStatus.BAD_REQUEST,
          `Transición inválida de ${currentState} a ${targetState}`,
          'Transición no permitida',
        );
      }

      // Actualizar estado
      const updated = await this.tenantRepository.updateStatus(
        tenantId,
        targetState,
      );

      // Crear evento de ciclo de vida
      const lifecycleEvent: TenantLifecycleEvent = {
        tenantId,
        fromState: currentState,
        toState: targetState,
        triggeredBy: {
          userId: actor.sub,
          username: actor.sub,
          roleKey: actor.scopes?.[0] || 'system',
        },
        comment: dto.comment,
        timestamp: new Date(),
        xstateSnapshot: this.getXstateSnapshot(targetState),
      };

      await this.lifecycleRepository.create(lifecycleEvent);

      // Emitir evento de transición
      this.eventEmitter.emit('tenant.state-transitioned', {
        tenantId,
        fromState: currentState,
        toState: targetState,
        triggeredBy: actor.sub,
        comment: dto.comment,
        timestamp: new Date(),
      });

      const responseDto = this.mapTenantToResponse(updated, undefined);

      return ApiResponse.ok<Tenant>(
        HttpStatus.OK,
        responseDto,
        'Estado actualizado exitosamente',
      );
    } catch (error) {
      this.logger.error(`Error transitioning tenant ${tenantId}:`, error);
      return ApiResponse.fail<Tenant>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno',
        'Error desconocido',
      );
    }
  }

  /**
   * Obtener historial de ciclo de vida de un tenant
   */
  async getTenantLifecycle(
    tenantId: string,
    pagination?: { page: number; limit: number },
  ): Promise<ApiResponse<TenantLifecyclePaginatedResponseDto>> {
    try {
      const result = await this.lifecycleRepository.findByTenantId(
        tenantId,
        pagination,
      );

      const dataDtos: TenantLifecycleEventResponseDto[] = result.data.map(
        (event) => this.mapLifecycleEventToResponse(event),
      );

      const response: TenantLifecyclePaginatedResponseDto = {
        data: dataDtos,
        meta: result.meta,
      };

      return ApiResponse.ok<TenantLifecyclePaginatedResponseDto>(
        HttpStatus.OK,
        response,
        'Historial recuperado',
      );
    } catch (error) {
      this.logger.error(
        `Error getting lifecycle for tenant ${tenantId}:`,
        error,
      );
      return ApiResponse.fail<TenantLifecyclePaginatedResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno',
        'Error desconocido',
      );
    }
  }

  /**
   * Mapear entidad de tenant a DTO de respuesta
   */
  private mapTenantToResponse(tenant: any, unmaskPan?: string): Tenant {
    const maskedPan = this.vaultService.maskPan(unmaskPan || 'unknown');

    return {
      id: tenant.id,
      businessName: tenant.businessName,
      legalRepresentative: tenant.legalRepresentative,
      businessAddress: {
        address: tenant.businessAddress.address,
        city: tenant.businessAddress.city,
        state: tenant.businessAddress.state,
        zipCode: tenant.businessAddress.zipCode,
        country: tenant.businessAddress.country,
      },
      maskedPan,
      unmaskPan: unmaskPan || undefined,
      email: tenant.email,
      phone: tenant.phone,
      status: tenant.status as TenantStatus,
      createdBy: tenant.createdBy,
      notes: tenant.notes,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  /**
   * Mapear evento de lifecycle a DTO
   */
  private mapLifecycleEventToResponse(
    event: any,
  ): TenantLifecycleEventResponseDto {
    return {
      id: event.id,
      tenantId: event.tenantId,
      fromState: event.fromState,
      toState: event.toState,
      triggeredBy: {
        userId: event.triggeredBy.userId,
        username: event.triggeredBy.username,
        roleKey: event.triggeredBy.roleKey,
      },
      comment: event.comment,
      timestamp: event.timestamp,
    };
  }

  /**
   * Verificar si un actor puede ver datos sensibles
   */
  private canViewSensitiveData(actor?: Actor): boolean {
    if (!actor) {
      return false;
    }

    // Verificar si tiene el permiso tenants.view-sensitive
    const allowedScopes = ['tenants.view-sensitive'];
    return (
      actor.scopes?.some((scope) => allowedScopes.includes(scope)) || false
    );
  }

  /**
   * Obtener snapshot de la máquina de estados
   */
  private getXstateSnapshot(state: TenantStatus): Record<string, any> {
    return {
      value: state,
      context: {},
      _event: {
        type: 'xstate.init',
      },
    };
  }
}
