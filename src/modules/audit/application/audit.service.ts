import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditEvent, AuditEventResult } from '../schemas/audit-event.schema';

export interface AuditLogOptions {
  module?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  tags?: string[];
  actorId?: string;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  latency?: number;
  statusCode?: number;
  response?: Record<string, any>;
}

/**
 * Servicio de Auditoría (Application Layer)
 * 
 * Responsabilidades:
 * - Orquestar captura de contexto completo
 * - Construir entradas de auditoría con metadata HTTP
 * - Emitir eventos para persistencia asíncrona
 * - Garantizar redacción de datos sensibles
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly asyncContext: AsyncContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Registrar operación con resultado exitoso (ALLOW)
   * ⭐ No bloqueante - auditoría se procesa de forma asincrónica
   */
  logAllow(
    action: string,
    resourceType: string,
    resourceRef: string,
    options?: AuditLogOptions,
  ): void {
    // Fire-and-forget: no esperar completación
    console.log(`[AUDIT-ALLOW-CALLED] action=${action}`);
    this.logOperation(action, resourceType, resourceRef, AuditEventResult.ALLOW, options).catch((error) => {
      console.log(`[AUDIT-ALLOW-FAILED] ${error.message}`);
      this.logger.error(`Audit operation failed: ${error.message}`, error);
    });
    console.log(`[AUDIT-ALLOW-RETURNED] no await - fire-and-forget`);
  }

  /**
   * Registrar operación rechazada (DENY)
   * ⭐ No bloqueante - auditoría se procesa de forma asincrónica
   */
  logDeny(
    action: string,
    resourceType: string,
    resourceRef: string,
    reason: string,
    options?: AuditLogOptions,
  ): void {
    // Fire-and-forget: no esperar completación
    this.logOperation(
      action,
      resourceType,
      resourceRef,
      AuditEventResult.DENY,
      {
        ...options,
        severity: 'HIGH',
      },
      reason,
    ).catch((error) => {
      this.logger.error(`Audit operation failed: ${error.message}`, error);
    });
  }

  /**
   * Registrar error en operación (ERROR)
   * ⭐ No bloqueante - auditoría se procesa de forma asincrónica
   */
  logError(
    action: string,
    resourceType: string,
    resourceRef: string,
    error: Error | { code: string; message: string; stack?: string },
    options?: AuditLogOptions,
  ): void {
    const errorInfo = error instanceof Error
      ? {
          code: 'UNKNOWN_ERROR',
          message: error.message,
          stack: error.stack,
        }
      : error;

    // Fire-and-forget: no esperar completación
    this.logOperation(
      action,
      resourceType,
      resourceRef,
      AuditEventResult.ERROR,
      {
        ...options,
        severity: 'CRITICAL',
        error: errorInfo,
      },
    ).catch((err) => {
      this.logger.error(`Audit operation failed: ${err.message}`, err);
    });
  }


  /**
   * Método core de auditoría
   */
  private async logOperation(
    action: string,
    resourceType: string,
    resourceRef: string,
    result: AuditEventResult,
    options?: AuditLogOptions,
    reason?: string,
  ): Promise<void> {
    let requestId: string | undefined;
    try {
      // 1. Extraer contexto completo
      requestId = this.asyncContext.getRequestId();
      console.log(`[AUDIT-LOG-OPERATION-START] requestId=${requestId} action=${action} actorId=${options?.actorId}`);
      const actor = this.asyncContext.getActor();
      const httpMetadata = this.asyncContext.getHttpMetadata();


      // 2. Construir entrada de auditoría
      const auditEntry: Partial<AuditEvent> = {
        requestId,
        at: new Date(),

        // ⭐ Actor: Usar actorKid (invariable) como identificador principal
        userId: options?.actorId || 'system',
        actorKid: options?.actorId || 'system',
        actorSub: actor?.sub, // Campo adicional para contexto
        actorScopes: actor?.scopes,
        ipAddress: actor?.ipAddress || httpMetadata?.capturedRequest?.headers?.ipAddress,
        userAgent: httpMetadata?.capturedRequest?.headers?.userAgent,

        // Operación
        action,
        module: options?.module,
        result,
        reason,

        // Recurso
        resourceType,
        resourceRef,

        // HTTP metadata
        method: httpMetadata?.capturedRequest?.method,
        endpoint: httpMetadata?.capturedRequest?.path,
        query: httpMetadata?.capturedRequest?.query,
        headers: httpMetadata?.capturedRequest?.headers,
        payload: httpMetadata?.capturedRequest?.body,
        statusCode: httpMetadata?.statusCode || options?.statusCode,
        latency: httpMetadata?.responseTime || options?.latency,
        response: httpMetadata?.capturedResponse?.body || options?.response,

        // Cambios
        changesBefore: options?.changes?.before,
        changesAfter: options?.changes?.after,

        // Error
        errorCode: options?.error?.code,
        errorMessage: options?.error?.message,
        errorStack: options?.error?.stack,

        // Compliance
        severity: options?.severity || 'MEDIUM',
        tags: options?.tags,
      };

      // 3. Emitir evento para persistencia (sincrónico, no necesita await)
      console.log(`[AUDIT-EMIT-EVENT] requestId=${requestId}`);
      this.eventEmitter.emit('audit.event-created', auditEntry);
      console.log(`[AUDIT-EMIT-EVENT-DONE] requestId=${requestId}`);

      this.logger.log(
        `[${requestId}] Audit logged: ${action} on ${resourceType}/${resourceRef} - ${result}`,
      );
    } catch (error: any) {
      console.log(`[AUDIT-LOG-OPERATION-ERROR] requestId=${requestId} error=${error}`);
      this.logger.error(
        `Failed to log audit entry for action ${action}: ${error.message}`,
        error,
      );
      // No relanzar - la auditoría no debe bloquear operaciones principales
    }
  }
}
