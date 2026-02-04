import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { v4 as uuidv4 } from 'uuid';

import { AsyncContextService } from 'src/common/context';
import { AuditService } from 'src/modules/audit/application/audit.service';

import { TenantsRepository } from '../../infrastructure/adapters/tenant.repository';

import { OAuth2ClientCredentials } from '../../domain';
import { ApiResponse } from 'src/common/types';

/**
 * Servicio para gestionar credenciales OAuth2 de tenants
 */
@Injectable()
export class TenantOAuth2CredentialsService {
    private readonly logger = new Logger(TenantOAuth2CredentialsService.name);

    constructor(
        private readonly asyncContextService: AsyncContextService,
        private readonly auditService: AuditService,
        private readonly tenantsRepository: TenantsRepository,
    ) { }

    /**
     * Genera nuevas credenciales OAuth2 (clientId y clientSecret como UUIDs sin guiones)
     * @returns Objeto con clientId y clientSecret generados
     */
    generateCredentials(): OAuth2ClientCredentials {
        return {
            clientId: uuidv4().replace(/-/g, ''),
            clientSecret: uuidv4().replace(/-/g, ''),
        };
    }

    /**
     * Regenera solo el clientSecret de un tenant y retorna las credenciales actualizadas
     * @param tenantId ID del tenant
     * @returns Objeto con clientId e id (el nuevo secret)
     */
    async regenerateSecret(tenantId: string): Promise<ApiResponse<OAuth2ClientCredentials>> {
        const requestId = this.asyncContextService.getRequestId();
        const userId = this.asyncContextService.getActorId();
        this.logger.log(
            `[${requestId}] Regenerating OAuth2 secret for tenant ${tenantId}`,
        );

        try {

            const tenant = await this.tenantsRepository.findById(tenantId);

            if (!tenant) {
                const errorMsg = `Tenant not found: ${tenantId}`;
                this.logger.warn(`[${requestId}] ${errorMsg}`);
                // Registrar acceso denegado
                this.auditService.logDeny('TENANT_FETCHED', 'tenant', tenantId, errorMsg, {
                    severity: 'LOW',
                    tags: ['tenant', 'read', 'not-found'],
                });
                return ApiResponse.fail<OAuth2ClientCredentials>(
                    HttpStatus.NOT_FOUND,
                    errorMsg,
                    'Tenant no encontrado',
                    { requestId, tenantId, userId },
                );
            }

            // Generar nuevo secret
            const newClientId = uuidv4().replace(/-/g, '');
            const newSecret = uuidv4().replace(/-/g, '');

            // Actualizar tenant con nuevo secret
            await this.tenantsRepository.updateOAuth2Credentials(
                tenantId,
                newClientId,
                newSecret,
            );

            this.logger.log(
                `[${requestId}] OAuth2 secret regenerated for tenant ${tenantId}`,
            );

            return ApiResponse.ok<OAuth2ClientCredentials>(
                HttpStatus.ACCEPTED,
                { clientId: newClientId, clientSecret: newSecret },
                'Credenciales OAuth2 regeneradas exitosamente',
                { requestId, tenantId, userId },
            );
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `[${requestId}] Error regenerating OAuth2 secret for tenant ${tenantId}: ${errorMsg}`,
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

            return ApiResponse.fail<OAuth2ClientCredentials>(
                HttpStatus.INTERNAL_SERVER_ERROR,
                'Error interno del servidor',
                'Error desconocido',
                { requestId, tenantId, userId },
            );
        }
    }
}
