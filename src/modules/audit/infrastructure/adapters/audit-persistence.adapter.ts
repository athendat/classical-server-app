import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditEvent, AuditEventDocument } from '../../schemas/audit-event.schema';

/**
 * Adapter para persistencia de auditoría en MongoDB
 * 
 * Responsabilidades:
 * - Escuchar eventos audit.event-created
 * - Persiste en colección audit_events
 * - Implementa indices para queries eficientes
 * - Maneja errores sin bloquear la request
 */
@Injectable()
export class AuditPersistenceAdapter implements OnModuleInit {
  private readonly logger = new Logger(AuditPersistenceAdapter.name);

  constructor(
    @InjectModel(AuditEvent.name)
    private readonly auditEventModel: Model<AuditEventDocument>,
  ) {}

  onModuleInit() {
    this.logger.log('AuditPersistenceAdapter initialized - waiting for audit events');
  }

  /**
   * Event listener para eventos de auditoría
   * ⭐ IMPORTANTE: Guardamos en background SIN esperar (fire-and-forget)
   * Esto evita bloquear la response HTTP del endpoint principal
   */
  @OnEvent('audit.event-created')
  handleAuditEventCreated(entry: Partial<AuditEvent>) {
    // Fire-and-forget: guardar en background sin bloquear
    console.log(`[AUDIT-PERSISTENCE-EVENT] action=${entry.action}`);
    this.logger.log(`[${entry.requestId}] AUDIT-PERSISTENCE: Starting persistAuditEventInBackground`);
    
    // ⭐ FIX: Asegurar que la promesa siempre se resuelve (con timeout para prevenir deadlocks)
    this.persistAuditEventInBackground(entry)
      .then(() => {
        console.log(`[AUDIT-PERSISTENCE-SUCCESS] action=${entry.action}`);
      })
      .catch((error) => {
        console.log(`[AUDIT-PERSISTENCE-ERROR] ${error.message}`);
        this.logger.error(
          `[${entry.requestId}] Failed to persist audit event for action ${entry.action}: ${error.message}`,
          error.stack,
        );
      });
    
    console.log(`[AUDIT-PERSISTENCE-RETURNED] no await`);
  }

  /**
   * Persistencia en background sin bloquear
   * ⭐ FIX: Agrega timeout de 5s para prevenir deadlocks
   */
  private async persistAuditEventInBackground(entry: Partial<AuditEvent>): Promise<void> {
    try {
      console.log(`[AUDIT-PERSISTENCE-SAVING] action=${entry.action}`);
      
      // Asegurar que el documento tiene `at` correctamente establecido
      if (!entry.at) {
        entry.at = new Date();
      }

      // ⭐ FIX: Agregar timeout de 5 segundos para prevenir deadlocks con MongoDB
      const savePromise = this.auditEventModel.create({
        ...entry,
      });

      // Esperar con timeout
      await Promise.race([
        savePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('MongoDB save timeout (5s)')), 5000),
        ),
      ]);

      console.log(`[AUDIT-PERSISTENCE-SAVED] action=${entry.action}`);
      this.logger.log(
        `[${entry.requestId}] Audit event persisted: ${entry.action} on ${entry.resourceType}`,
      );
    } catch (error: any) {
      console.log(`[AUDIT-PERSISTENCE-SAVE-FAILED] error=${error.message}`);
      this.logger.error(
        `Failed to persist audit event for action ${entry.action}: ${error.message}`,
        error.stack,
      );
      // No relanzar excepción - solo loguear
    }
  }
}
