import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';
import { CryptoService } from 'src/common/crypto/crypto.service';
import { v4 as uuidv4 } from 'uuid';
import { Tenant } from '../../infrastructure/schemas/tenant.schema';
import { CreateTenantWebhookDto, mapWebhookToResponse } from '../../dto/webhook.dto';
import { AsyncContextService } from 'src/common/context';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { Webhook } from '../../domain';
import { TenantRepository } from '../../infrastructure/adapters/tenant.repository';
import { ApiResponse } from 'src/common/types';



/**
 * Servicio para gestionar webhooks de tenants
 */
@Injectable()
export class TenantWebhooksService {
  private readonly logger = new Logger(TenantWebhooksService.name);

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly tenantRepository: TenantRepository,
  ) { }

  /**
   * Genera un webhook por defecto con secret aleatorio para un nuevo tenant
   * @returns Objeto webhook con id, url=null, events=[], active=true, secret generado
   */
  generateWebhook(): Webhook {
    return {
      id: uuidv4(),
      url: null,
      events: [],
      secret: uuidv4().replace(/-/g, ''),
    };
  }

  /**
   * Regenera solo el secret del webhook existente de un tenant
   * @param tenantId ID del tenant
   * @returns Objeto con id del webhook e secret regenerado
   */
  async regenerateSecret(tenantId: string): Promise<ApiResponse<{ secret: string }>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();

    this.logger.log(
      `[${requestId}] Regenerating webhook secret for tenant ${tenantId}`,
    );

    try {

      const tenant = await this.tenantRepository.findById(tenantId);

      if (!tenant) {
        const errorMsg = `Tenant not found: ${tenantId}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        // Registrar acceso denegado
        this.auditService.logDeny('TENANT_FETCHED', 'tenant', tenantId, errorMsg, {
          severity: 'LOW',
          tags: ['tenant', 'read', 'not-found'],
        });
        return ApiResponse.fail<{ secret: string }>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Tenant no encontrado',
          { requestId, tenantId, userId },
        );
      }

      // Generar nuevo secret
      const newSecret = uuidv4().replace(/-/g, '');

      // Actualizar tenant con nuevo secret del webhook
      await this.tenantRepository.updateWebhookSecret(
        tenantId,
        newSecret,
      );

      this.logger.log(
        `[${requestId}] Webhook secret regenerated for tenant ${tenantId}`,
      );

      return ApiResponse.ok<{ secret: string }>(
        HttpStatus.ACCEPTED,
        { secret: newSecret },
        'Webhook secret regenerado exitosamente',
        { requestId, tenantId, userId },
      );

    } catch (error) {
      this.logger.error(
        `[${requestId}] Error regenerating webhook secret for tenant ${tenantId}: ${error?.message ?? error}`,
        error,
      );

      // Registrar el error en auditoría
      this.auditService.logDeny('TENANT_WEBHOOK_ERROR', 'tenant', tenantId, String(error), {
        severity: 'HIGH',
        tags: ['tenant', 'webhook', 'error'],
      });

      return ApiResponse.fail<{ secret: string }>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        String(error),
        'Error al regenerar secret del webhook',
        { requestId, tenantId, userId },
      );
    }
  }

  /**
   * Actualiza la URL del webhook de un tenant
   * @param tenantId ID del tenant
   * @param url Nueva URL del webhook
   * @returns Objeto con el webhook actualizado
   */
  async updateUrl(
    tenantId: string,
    url: string,
  ): Promise<ApiResponse<{ id: string; url: string }>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId();

    this.logger.log(
      `[${requestId}] Updating webhook URL for tenant ${tenantId}`,
    );

    try {
      const tenant = await this.tenantRepository.findById(tenantId);

      if (!tenant) {
        const errorMsg = `Tenant not found: ${tenantId}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        
        this.auditService.logDeny('WEBHOOK_URL_UPDATE', 'tenant', tenantId, errorMsg, {
          severity: 'LOW',
          tags: ['webhook', 'update-url', 'not-found'],
        });

        return ApiResponse.fail<{ id: string; url: string }>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Tenant no encontrado',
          { requestId, tenantId, userId },
        );
      }

      if (!tenant.webhook) {
        const errorMsg = `Webhook not found for tenant: ${tenantId}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        
        this.auditService.logDeny('WEBHOOK_URL_UPDATE', 'tenant', tenantId, errorMsg, {
          severity: 'LOW',
          tags: ['webhook', 'update-url', 'webhook-not-found'],
        });

        return ApiResponse.fail<{ id: string; url: string }>(
          HttpStatus.NOT_FOUND,
          errorMsg,
          'Webhook no encontrado',
          { requestId, tenantId, userId },
        );
      }

      // Actualizar URL del webhook
      await this.tenantRepository.updateWebhookUrl(tenantId, url);

      this.logger.log(
        `[${requestId}] Webhook URL updated for tenant ${tenantId}`,
      );

      // Registrar en auditoría
      this.auditService.logAllow('WEBHOOK_URL_UPDATED', 'webhook', tenant.webhook.id, {
        severity: 'MEDIUM',
        tags: ['webhook', 'update-url', 'successful', `tenantId:${tenantId}`],
        actorId: userId,
        changes: {
          after: {
            webhookId: tenant.webhook.id,
            url,
          },
        },
      });

      return ApiResponse.ok<{ id: string; url: string }>(
        HttpStatus.OK,
        { id: tenant.webhook.id, url },
        'URL del webhook actualizada exitosamente',
        { requestId, tenantId, userId },
      );
    } catch (error) {
      this.logger.error(
        `[${requestId}] Error updating webhook URL for tenant ${tenantId}: ${error?.message ?? error}`,
        error,
      );

      // Registrar el error en auditoría
      this.auditService.logError(
        'WEBHOOK_URL_UPDATE',
        'webhook',
        'unknown',
        error instanceof Error ? error : new Error(String(error)),
        {
          severity: 'HIGH',
          tags: ['webhook', 'update-url', 'error', `tenantId:${tenantId}`],
        },
      );

      return ApiResponse.fail<{ id: string; url: string }>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        String(error),
        'Error al actualizar URL del webhook',
        { requestId, tenantId, userId },
      );
    }
  }
}
