import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpStatus } from '@nestjs/common';

import { v4 as uuidv4 } from 'uuid';

import { AsyncContextService } from '../../../common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { TenantVaultService } from '../infrastructure/services/tenant-vault.service';

import { TenantsRepository } from '../infrastructure/adapters/tenant.repository';
import { TenantLifecycleRepository } from '../infrastructure/adapters/tenant-lifecycle.repository';

import { Tenant } from '../infrastructure/schemas/tenant.schema';

import {
  CreateTenantDto,
  UpdateTenantDto,
  TransitionTenantStateDto,
  TenantLifecyclePaginatedResponseDto,
  TenantLifecycleEventResponseDto,
  TenantCredentialsResponseDto,
  UpdateTenantCredentialsDto,
} from '../dto';

import { isValidStateTransition } from '../domain/tenant.state-machine';

import { Actor } from 'src/common/interfaces';
import { ApiResponse } from 'src/common/types/api-response.type';
import { buildMongoQuery } from 'src/common/helpers';
import { PaginationMeta, QueryParams } from 'src/common/types';
import { TenantLifecycleEvent } from '../domain/interfaces/lifecycle-event.interface';
import { TenantStatus } from '../domain/enums';
import { TenantOAuth2CredentialsService } from './services/tenant-oauth2-credentials.service';
import { TenantWebhooksService } from './services/tenant-webhooks.service';
import { MongoDbUsersRepository } from 'src/modules/users/infrastructure/adapters';

/**
 * Servicio de aplicación para tenants
 * Orquesta la lógica de negocio para CRUD de tenants y transiciones de estado
 */
@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly lifecycleRepository: TenantLifecycleRepository,
    private readonly oauth2CredentialsService: TenantOAuth2CredentialsService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly vaultService: TenantVaultService,
    private readonly webhooksService: TenantWebhooksService,
    private readonly usersRepository: MongoDbUsersRepository,
  ) { }

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
      const existingTenant = await this.tenantsRepository.findByEmail(dto.email);
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

      // Generar credenciales OAuth2 y webhook automáticamente
      const oauth2Credentials = this.oauth2CredentialsService.generateCredentials();

      // Guardar secreto del OAuth2 en Vault
      const saveOAuth2SecretResult = await this.vaultService.saveOAuth2ClientSecret(
        tenantId,
        oauth2Credentials.clientSecret!,
      );

      if (saveOAuth2SecretResult.isFailure) {
        this.logger.error('Failed to save OAuth2 client secret to Vault');
        return ApiResponse.fail<Tenant>(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Error al procesar credenciales OAuth2',
          'Error interno',
        );
      }

      const webhook = this.webhooksService.generateWebhook();

      // Crear tenant en MongoDB
      // Nota: Solo guardamos clientId, el clientSecret se guarda en Vault
      const tenantData = {
        id: tenantId,
        businessName: dto.businessName,
        legalRepresentative: dto.legalRepresentative,
        businessAddress: dto.businessAddress,
        panVaultKeyId,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        nit: dto.nit,
        mcc: dto.mcc,
        status: TenantStatus.PENDING_REVIEW,
        userId,
        notes: dto.notes,
        oauth2ClientCredentials: {
          clientId: oauth2Credentials.clientId,
          // clientSecret NO se guarda aquí, está en Vault
        },
        webhook: webhook,
      };

      const newTenant = await this.tenantsRepository.create(tenantData);

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

      // Enriquecer tenant con datos del Vault
      const vaultData = await this.enrichTenantWithVaultData(newTenant);
      const responseDto = this.mapTenantToResponse(newTenant, vaultData);

      // Agregar tenantId al usuario (si no tiene uno asignado)
      await this.usersRepository.addTenantIdToUser(userId, tenantId);

      return ApiResponse.ok<Tenant>(
        HttpStatus.CREATED,
        responseDto,
        'Tenant creado exitosamente',
        { requestId }
      );
    } catch (error: any) {
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
    this.logger.log(`[${requestId}] Fetching tenant by id: ${id}`);

    try {
      const tenant = await this.tenantsRepository.findById(id);

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

      // Enriquecer tenant con datos del Vault
      const vaultData = await this.enrichTenantWithVaultData(tenant);
      const responseDto = this.mapTenantToResponse(tenant, vaultData);

      return ApiResponse.ok<Tenant>(HttpStatus.OK, responseDto, undefined, {
        requestId,
        id,
      });
    } catch (error: any) {
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
   * Obtener un tenant por usuario
   */
  async getTenantByUser(): Promise<ApiResponse<Tenant>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;

    this.logger.log(`[${requestId}] Fetching tenant by user: ${userId}`);
    try {

      const tenant = await this.tenantsRepository.findByUserId(userId);

      if (!tenant) {
        const errorMsg = `Tenant no encontrado para el usuario: ${userId}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        // Registrar acceso denegado
        this.auditService.logDeny('TENANT_FETCHED', 'tenant', userId, errorMsg, {
          severity: 'LOW',
          tags: ['tenant', 'read', 'not-found'],
        });
        return ApiResponse.fail<Tenant>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Tenant no encontrado',
          { requestId, userId },
        );
      }


      // Registrar lectura exitosa
      this.auditService.logAllow('TENANT_FETCHED', 'tenant', userId, {
        module: 'tenants',
        severity: 'LOW',
        tags: ['tenant', 'read', 'successful'],
        actorId: userId,
      });

      // Enriquecer tenant con datos del Vault
      const panResult = await this.vaultService.getPan(tenant.id);

      const maskedPan = this.vaultService.maskPan(panResult.getValue());
      const unmaskPan = panResult.getValue();
      
      const responseDto = this.mapTenantToResponse(tenant, { maskedPan, unmaskPan });

      return ApiResponse.ok<Tenant>(HttpStatus.OK, responseDto, undefined, {
        requestId,
        userId,
      });
    } catch (error: any) {
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
        userId || 'unknown',
        error instanceof Error ? error : new Error(errorMsg),
        {
          severity: 'MEDIUM',
          tags: ['tenant', 'read', 'error'],
          actorId: userId || 'unknown',
        },
      );
      return ApiResponse.fail<Tenant>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener tenant',
        { requestId, userId, },
      );
    }
  }

  /**
   * Listar tenants con paginación y filtros
   */
  async listTenants(queryParams: QueryParams): Promise<ApiResponse<Tenant[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();
    this.logger.log(
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

      this.logger.log(
        `[${requestId}] MongoDB filter: ${JSON.stringify(mongoFilter)}`,
      );
      this.logger.log(
        `[${requestId}] Query options: ${JSON.stringify(options)}`,
      );

      // Ejecutar consulta directamente en MongoDB
      const { data: tenants, total } = await this.tenantsRepository.findAll(
        mongoFilter,
        options,
      );

      const limit = options.limit;
      const page = queryParams.page || 1;
      const totalPages = Math.ceil(total / limit);
      const skip = options.skip;
      const hasMore = skip + limit < total;

      this.logger.log(
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
    } catch (error: any) {
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

      const tenant = await this.tenantsRepository.findById(id);

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
        const existingTenant = await this.tenantsRepository.findByEmail(
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
      const updated = await this.tenantsRepository.update(id, updateData);

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

      // Enriquecer tenant con datos del Vault
      const vaultData = await this.enrichTenantWithVaultData(updated);
      const responseDto = this.mapTenantToResponse(updated, vaultData);

      return ApiResponse.ok<Tenant>(
        HttpStatus.OK,
        responseDto,
        'Tenant actualizado',
        { requestId }
      );
    } catch (error: any) {
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
   * Obtener credenciales (OAuth2 y Webhook) del tenant del usuario actual
   */
  async getTenantCredentialsByUser(): Promise<ApiResponse<TenantCredentialsResponseDto>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;

    this.logger.log(`[${requestId}] Fetching credentials for user: ${userId}`);

    try {
      const tenant = await this.tenantsRepository.findByUserId(userId);

      if (!tenant) {
        return ApiResponse.fail<TenantCredentialsResponseDto>(
          HttpStatus.NOT_FOUND,
          'Tenant no encontrado para el usuario',
          'El usuario no tiene un tenant asociado',
          { requestId, userId }
        );
      }

      // Mapear credenciales
      // Obtener clientSecret del Vault
      const clientSecretResult = await this.vaultService.getOAuth2ClientSecret(tenant.id);
      const clientSecret = clientSecretResult.isSuccess ? clientSecretResult.getValue() : '';

      const credentials: TenantCredentialsResponseDto = {
        oauth2: {
          clientId: tenant.oauth2ClientCredentials?.clientId || '',
          clientSecret,
        },
        webhook: {
          id: tenant.webhook?.id || '',
          url: tenant.webhook?.url || null,
          events: tenant.webhook?.events || [],
          secret: tenant.webhook?.secret || '',
        },
      };

      return ApiResponse.ok<TenantCredentialsResponseDto>(
        HttpStatus.OK,
        credentials,
        'Credenciales obtenidas con éxito',
        { requestId }
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to fetch credentials: ${errorMsg}`, error);
      return ApiResponse.fail<TenantCredentialsResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener credenciales',
        { requestId }
      );
    }
  }

  /**
   * Actualizar credenciales (principalmente el webhook) del tenant del usuario actual
   */
  async updateTenantCredentialsByUser(
    dto: UpdateTenantCredentialsDto,
  ): Promise<ApiResponse<TenantCredentialsResponseDto>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;

    this.logger.log(`[${requestId}] Updating credentials for user: ${userId}`);

    try {
      const tenant = await this.tenantsRepository.findByUserId(userId);

      if (!tenant) {
        return ApiResponse.fail<TenantCredentialsResponseDto>(
          HttpStatus.NOT_FOUND,
          'Tenant no encontrado para el usuario',
          'El usuario no tiene un tenant asociado',
          { requestId, userId }
        );
      }

      // Preparar actualización del webhook
      const webhookUpdate: any = { ...tenant.webhook };
      if (dto.webhookUrl !== undefined) webhookUpdate.url = dto.webhookUrl;
      if (dto.webhookEvents !== undefined) webhookUpdate.events = dto.webhookEvents;

      // Actualizar en el repositorio
      const updatedTenant = await this.tenantsRepository.update(tenant.id, {
        webhook: webhookUpdate,
      });

      // Obtener clientSecret del Vault
      const clientSecretResult = await this.vaultService.getOAuth2ClientSecret(tenant.id);
      const clientSecret = clientSecretResult.isSuccess ? clientSecretResult.getValue() : '';

      const credentials: TenantCredentialsResponseDto = {
        oauth2: {
          clientId: updatedTenant.oauth2ClientCredentials?.clientId || '',
          clientSecret,
        },
        webhook: {
          id: updatedTenant.webhook?.id || '',
          url: updatedTenant.webhook?.url || null,
          events: updatedTenant.webhook?.events || [],
          secret: updatedTenant.webhook?.secret || '',
        },
      };

      // Registrar auditoría
      this.auditService.logAllow('TENANT_CREDENTIALS_UPDATED', 'tenant', tenant.id, {
        module: 'tenants',
        severity: 'MEDIUM',
        tags: ['tenant', 'credentials', 'update'],
        actorId: userId,
        changes: {
          before: {
            webhookUrl: tenant.webhook?.url,
            webhookEvents: tenant.webhook?.events,
          },
          after: {
            webhookUrl: dto.webhookUrl,
            webhookEvents: dto.webhookEvents,
          },
        },
      });

      return ApiResponse.ok<TenantCredentialsResponseDto>(
        HttpStatus.OK,
        credentials,
        'Credenciales actualizadas exitosamente',
        { requestId }
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Failed to update credentials: ${errorMsg}`, error);
      return ApiResponse.fail<TenantCredentialsResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al actualizar credenciales',
        { requestId }
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
      const tenant = await this.tenantsRepository.findById(tenantId);

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
      const updated = await this.tenantsRepository.updateStatus(
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

      // Enriquecer tenant con datos del Vault
      const vaultData = await this.enrichTenantWithVaultData(updated);
      const responseDto = this.mapTenantToResponse(updated, vaultData);

      return ApiResponse.ok<Tenant>(
        HttpStatus.OK,
        responseDto,
        'Estado actualizado exitosamente',
      );
    } catch (error: any) {
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
    } catch (error: any) {
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
   * Enriquecer tenant con datos sensibles del Vault (maskedPan y unmaskPan)
   * Obtiene el PAN del Vault si el usuario tiene permisos
   */
  private async enrichTenantWithVaultData(
    tenant: Tenant,
  ): Promise<{ maskedPan: string; unmaskPan?: string }> {
    try {
      const actor = this.asyncContextService.getActor();
      const canViewUnmasked = this.canViewSensitiveData(actor);
      let unmaskPan: string | undefined;

      this.logger.log(
        `[enrichTenantWithVaultData] tenant.id=${tenant.id}, panVaultKeyId=${tenant.panVaultKeyId}, canViewUnmasked=${canViewUnmasked}`,
      );

      if (canViewUnmasked && tenant.panVaultKeyId) {
        this.logger.log(`[enrichTenantWithVaultData] Attempting to retrieve PAN from Vault for tenant: ${tenant.id}`);
        const panResult = await this.vaultService.getPan(tenant.id);

        if (panResult.isSuccess) {
          unmaskPan = panResult.getValue();
          this.logger.log(`[enrichTenantWithVaultData] Successfully retrieved PAN from Vault (last4: ${unmaskPan?.slice(-4)})`);
        } else {
          const error = panResult.getError();
          this.logger.warn(
            `[enrichTenantWithVaultData] Failed to retrieve PAN from Vault: ${error?.message || String(error)}`,
          );
        }
      } else {
        this.logger.log(
          `[enrichTenantWithVaultData] Skipping PAN retrieval - canViewUnmasked=${canViewUnmasked}, hasPanVaultKeyId=${!!tenant.panVaultKeyId}`,
        );
      }

      // Usar PAN si se obtuvo, de lo contrario usar valor vacío para enmascarar
      const maskedPan = unmaskPan
        ? this.vaultService.maskPan(unmaskPan)
        : '**** **** **** ****';

      return {
        maskedPan,
        unmaskPan: unmaskPan || undefined,
      };
    } catch (error: any) {
      this.logger.warn(
        `Failed to enrich tenant ${tenant.id} with vault data: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      // En caso de error, retornar solo el PAN enmascarado
      return {
        maskedPan: '**** **** **** ****',
        unmaskPan: undefined,
      };
    }
  }

  /**
   * Mapear entidad de tenant a DTO de respuesta
   */
  private mapTenantToResponse(
    tenant: any,
    vaultData: { maskedPan: string; unmaskPan?: string },
  ): Tenant {
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
      maskedPan: vaultData.maskedPan,
      unmaskPan: vaultData.unmaskPan,
      email: tenant.email,
      phone: tenant.phone,
      nit: tenant.nit,
      mcc: tenant.mcc,
      status: tenant.status as TenantStatus,
      userId: tenant.userId,
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
      this.logger.log('[canViewSensitiveData] No actor available');
      return false;
    }

    // Verificar si tiene el permiso tenants.view-sensitive
    const allowedScopes = ['tenants.view-sensitive'];
    const hasPermission = actor.scopes?.some((scope) => allowedScopes.includes(scope)) || false;

    this.logger.log(
      `[canViewSensitiveData] actor.scopes=${JSON.stringify(actor.scopes)}, hasPermission=${hasPermission}`,
    );

    return hasPermission;
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
