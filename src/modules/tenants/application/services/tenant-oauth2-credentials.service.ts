import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { v4 as uuidv4 } from 'uuid';

import { AsyncContextService } from 'src/common/context';
import { AuditService } from 'src/modules/audit/application/audit.service';

import { TenantsRepository } from '../../infrastructure/adapters/tenant.repository';
import { TenantVaultService } from '../../infrastructure/services/tenant-vault.service';

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
        private readonly vaultService: TenantVaultService,
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
     * Rota el secret en Vault y actualiza la BD
     * @returns Objeto con clientId e clientSecret regenerado
     */
    async regenerateSecret(): Promise<ApiResponse<OAuth2ClientCredentials>> {
        const requestId = this.asyncContextService.getRequestId();
        const userId = this.asyncContextService.getActorId()!;

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
                return ApiResponse.fail<OAuth2ClientCredentials>(
                    HttpStatus.NOT_FOUND,
                    errorMsg,
                    'Tenant no encontrado',
                    { requestId, userId },
                );
            }

            this.logger.log(
                `[${requestId}] Regenerating OAuth2 secret for tenant ${tenant.id}`,
            );

            // Generar nuevo secret
            const newSecret = uuidv4().replace(/-/g, '');

            // Rotar el secret en Vault
            const rotateResult = await this.vaultService.rotateOAuth2ClientSecret(
                tenant.id,
                newSecret,
            );

            if (rotateResult.isFailure) {
                const errorMsg = 'Failed to rotate OAuth2 client secret in Vault';
                this.logger.error(`[${requestId}] ${errorMsg}`);
                this.auditService.logError(
                    'OAUTH2_SECRET_ROTATION',
                    'oauth2-credentials',
                    tenant.id,
                    rotateResult.getError(),
                    {
                        module: 'tenants',
                        severity: 'HIGH',
                        tags: ['oauth2', 'rotation', 'vault', 'error'],
                        actorId: userId,
                    },
                );
                return ApiResponse.fail<OAuth2ClientCredentials>(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    'Error al rotar credenciales en Vault',
                    'Error interno',
                    { requestId, tenantId: tenant.id, userId },
                );
            }

            // Actualizar tenant en BD (solo clientId, el secret ya está en Vault después de rotar)
            // El updateOAuth2Credentials ahora solo guarda el clientId
            await this.tenantsRepository.updateOAuth2Credentials(
                tenant.id,
                tenant.oauth2ClientCredentials!.clientId,
                newSecret, // Se ignora en el repository, el secret está en Vault
            );

            const rotationData = rotateResult.getValue();

            this.logger.log(
                `[${requestId}] OAuth2 secret regenerated for tenant ${tenant.id}, version: ${rotationData.version}`,
            );

            // Registrar rotación exitosa
            this.auditService.logAllow(
                'OAUTH2_SECRET_ROTATION',
                'oauth2-credentials',
                tenant.id,
                {
                    module: 'tenants',
                    severity: 'MEDIUM',
                    tags: ['oauth2', 'rotation', 'vault', 'success'],
                    actorId: userId,
                    changes: {
                        after: {
                            version: rotationData.version,
                            rotatedAt: rotationData.rotatedAt,
                        },
                    },
                },
            );

            return ApiResponse.ok<OAuth2ClientCredentials>(
                HttpStatus.ACCEPTED,
                {
                    clientId: tenant.oauth2ClientCredentials!.clientId,
                    clientSecret: newSecret
                },
                'Credenciales OAuth2 regeneradas exitosamente',
                { requestId, tenantId: tenant.id, userId },
            );
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `[${requestId}] Error regenerating OAuth2 secret for tenant of user: ${userId}: ${errorMsg}`,
                error,
            );

            this.auditService.logError(
                'OAUTH2_SECRET_ROTATION',
                'oauth2-credentials',
                'unknown',
                error instanceof Error ? error : new Error(String(error)),
                {
                    module: 'tenants',
                    severity: 'HIGH',
                    tags: ['oauth2', 'rotation', 'error'],
                    actorId: userId,
                },
            );

            return ApiResponse.fail<OAuth2ClientCredentials>(
                HttpStatus.INTERNAL_SERVER_ERROR,
                'Error interno del servidor',
                'Error desconocido',
                { requestId, userId },
            );
        }
    }
}
