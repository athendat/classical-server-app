import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AuditEvent,
  AuditEventDocument,
} from '../../schemas/audit-event.schema';

/**
 * Adapter para actualizar auditoría con respuesta capturada
 *
 * ⭐ PROBLEMA RESUELTO:
 * Cuando AuditService.logAllow/logDeny/logError se llama DENTRO del controlador,
 * la response aún no ha sido capturada por AuditInterceptor.
 *
 * SOLUCIÓN:
 * - AuditInterceptor emite evento 'audit.response-captured' con response y statusCode
 * - Este adapter escucha el evento y actualiza la auditoría existente
 * - Resultado: La response y statusCode quedan registrados correctamente
 */
@Injectable()
export class AuditResponseUpdateAdapter implements OnModuleInit {
  private readonly logger = new Logger(AuditResponseUpdateAdapter.name);

  constructor(
    @InjectModel(AuditEvent.name)
    private readonly auditEventModel: Model<AuditEventDocument>,
  ) {}

  onModuleInit() {
    this.logger.log('AuditResponseUpdateAdapter initialized');
  }

  /**
   * Event listener para actualizar auditoría con response capturada
   * Se ejecuta asincronamente después de que el interceptor captura la response
   */
  @OnEvent('audit.response-captured')
  async handleResponseCaptured(data: {
    requestId: string;
    statusCode: number;
    response: any;
    responseTime: number;
    method?: string;
    endpoint?: string;
    headers?: any;
    timestamp?: string;
  }) {
    try {
      console.log(
        `[AUDIT-RESPONSE-UPDATE] requestId=${data.requestId} statusCode=${data.statusCode}`,
      );

      // ⭐ Sanitizar response antes de guardar en BD
      // Evita problemas con referencias circulares en Error objects
      const sanitizedResponse = this.sanitizeForMongoDB(data.response);

      // ⭐ Agregar pequeño delay para asegurar que el documento ya fue guardado
      // Los eventos son síncronos pero la persistencia en background es asincrónica
      console.log(
        `[AUDIT-RESPONSE-UPDATE] Waiting 50ms for document to be saved...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      // ⭐ Buscar auditorías para este requestId creadas en los últimos 5 segundos
      // Esto evita actualizar registros antiguos si se reutilizan requestIds
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      console.log(
        `[AUDIT-RESPONSE-UPDATE] Searching for records with requestId=${data.requestId} created after ${fiveSecondsAgo.toISOString()}`,
      );

      const auditRecords = await this.auditEventModel
        .find({
          requestId: data.requestId,
          createdAt: { $gte: fiveSecondsAgo },
        })
        .sort({ createdAt: -1 })
        .limit(5); // Limitar a últimas 5 para evitar actualizar muchas

      console.log(
        `[AUDIT-RESPONSE-UPDATE] Found ${auditRecords.length} audit record(s) for requestId=${data.requestId}`,
      );

      // Actualizar TODOS los registros sin statusCode de esta request
      // (en caso de múltiples operaciones en la misma request)
      let updatedCount = 0;
      for (const auditRecord of auditRecords) {
        console.log(
          `[AUDIT-RESPONSE-UPDATE] Processing record id=${auditRecord._id}, action=${auditRecord.action}, hasStatusCode=${!!auditRecord.statusCode}`,
        );

        // Solo actualizar si aún no tiene statusCode
        if (!auditRecord.statusCode) {
          auditRecord.statusCode = data.statusCode;
          auditRecord.response = sanitizedResponse;
          auditRecord.latency = data.responseTime;

          // Rellenar datos HTTP si no están presentes
          if (!auditRecord.method && data.method) {
            auditRecord.method = data.method;
          }
          if (!auditRecord.endpoint && data.endpoint) {
            auditRecord.endpoint = data.endpoint;
          }
          if (!auditRecord.headers && data.headers) {
            auditRecord.headers = data.headers;
          }

          await auditRecord.save();
          console.log(
            `[AUDIT-RESPONSE-UPDATE] Updated record id=${auditRecord._id}`,
          );
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        this.logger.log(
          `[${data.requestId}] Updated ${updatedCount} audit event(s) with response: statusCode=${data.statusCode}, latency=${data.responseTime}ms`,
        );
        console.log(
          `[AUDIT-RESPONSE-UPDATE] SUCCESS: Updated ${updatedCount} record(s)`,
        );
      } else {
        this.logger.warn(
          `[${data.requestId}] No audit event found to update with response (found ${auditRecords.length} records but all had statusCode)`,
        );
        console.log(
          `[AUDIT-RESPONSE-UPDATE] WARNING: Found records but none needed updating`,
        );
      }
    } catch (error: any) {
      console.log(`[AUDIT-RESPONSE-UPDATE-ERROR] ${error.message}`);
      this.logger.error(
        `Failed to update audit event with response for requestId ${data.requestId}: ${error.message}`,
        error,
      );
      // No lanzar excepción - evitar impactar operaciones principales
    }
  }

  /**
   * Sanitizar datos para guardar en MongoDB
   * Convierte Error objects y otras estructuras circulares a formas serializables
   */
  private sanitizeForMongoDB(value: any): any {
    // Manejar Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    // Manejar arrays
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeForMongoDB(item));
    }

    // Manejar objetos planos
    if (value !== null && typeof value === 'object') {
      const sanitized: Record<string, any> = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          try {
            const sanitizedValue = this.sanitizeForMongoDB(value[key]);
            sanitized[key] = sanitizedValue;
          } catch {
            // Ignorar propiedades que causen problemas
            sanitized[key] = '[UNSERIALIZABLE]';
          }
        }
      }
      return sanitized;
    }

    return value;
  }
}
