import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

import {
  IAuditService,
  AuditLogEntry,
  AuditError,
} from '../../domain/ports/audit.port';
import { AuditOperationEvent } from '../../events/audit-operation.event';
import {
  AuditEvent,
  AuditEventDocument,
} from '../../schemas/audit-event.schema';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Result } from 'src/common/types/result.type';

/**
 * Hexagonal adapter for audit service.
 * Handles audit logging with redaction for sensitive data.
 */
@Injectable()
export class AuditAdapter implements IAuditService {
  private readonly logger = new Logger(AuditAdapter.name);
  private readonly sensitiveFields = [
    'token',
    'secret',
    'password',
    'apiKey',
    'ksn',
    'pin',
  ];

  constructor(
    @InjectModel(AuditEvent.name)
    private auditModel: Model<AuditEventDocument>,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly asyncContext: AsyncContextService,
  ) {}

  /**
   * Log an audit event.
   */
  async log(entry: AuditLogEntry): Promise<Result<string>> {
    const startTime = Date.now();

    try {
      // Redact sensitive data before logging
      const redactedEntry = this.redactSensitiveData(entry);

      const auditEvent = new this.auditModel({
        requestId: redactedEntry.requestId || 'unknown',
        actorKid: redactedEntry.actor.id || 'system', // ⭐ Use invariable kid
        action: redactedEntry.operation,
        resourceType: redactedEntry.resource.type,
        resourceRef: redactedEntry.resource.id,
        result: redactedEntry.status === 'success' ? 'allow' : 'deny',
        reason: redactedEntry.error?.message,
        at: new Date(),
      });

      await auditEvent.save();

      const entryId =
        redactedEntry.id || auditEvent._id?.toString() || 'unknown';

      this.emitEvent(
        'log',
        'completed',
        Date.now() - startTime,
        entryId,
        redactedEntry.actor.id,
        redactedEntry.resource.type,
      );

      return Result.ok(entryId);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to log audit event: ${err.message}`, err.stack);

      const auditError: AuditError = {
        name: 'AuditError',
        message: err.message,
        code: 'AUDIT_LOG_FAILED',
        statusCode: 500,
      };

      this.emitEvent('log', 'failed', Date.now() - startTime);
      return Result.fail(auditError);
    }
  }

  /**
   * Query audit log entries.
   */
  async query(
    actorId?: string,
    operationType?: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Result<{ entries: AuditLogEntry[]; total: number }>> {
    const startTime = Date.now();

    try {
      const query: any = {};
      if (actorId) query.actorKid = actorId; // ⭐ Use invariable kid for trazability
      if (operationType) query.action = operationType;

      const [events, total] = await Promise.all([
        this.auditModel
          .find(query)
          .sort({ at: -1 })
          .limit(limit)
          .skip(offset)
          .lean()
          .exec(),
        this.auditModel.countDocuments(query).exec(),
      ]);

      const entries: AuditLogEntry[] = events.map((evt: any) => ({
        id: evt._id?.toString() || 'unknown',
        timestamp: evt.at?.getTime() || Date.now(),
        actor: {
          id: evt.actorKid || evt.actorSub || 'unknown', // Prefer invariable kid
          type: 'user',
        },
        operation: evt.action,
        resource: {
          type: evt.resourceType,
          id: evt.resourceRef || 'unknown',
        },
        status: evt.result === 'allow' ? 'success' : 'failure',
        requestId: evt.requestId,
        error: evt.reason
          ? { code: 'AUDIT_ERROR', message: evt.reason }
          : undefined,
      }));

      this.emitEvent(
        'query',
        'completed',
        Date.now() - startTime,
        undefined,
        actorId,
      );

      return Result.ok({ entries, total });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to query audit logs: ${err.message}`,
        err.stack,
      );

      const auditError: AuditError = {
        name: 'AuditError',
        message: err.message,
        code: 'AUDIT_QUERY_FAILED',
        statusCode: 500,
      };

      this.emitEvent('query', 'failed', Date.now() - startTime);
      return Result.fail(auditError);
    }
  }

  /**
   * Get audit entry by ID.
   */
  async getEntry(entryId: string): Promise<Result<AuditLogEntry>> {
    const startTime = Date.now();

    try {
      const evt = await this.auditModel.findById(entryId).lean().exec();

      if (!evt) {
        const err: AuditError = {
          name: 'AuditError',
          message: `Entry not found: ${entryId}`,
          code: 'AUDIT_ENTRY_NOT_FOUND',
          statusCode: 404,
        };
        return Result.fail(err);
      }

      const entry: AuditLogEntry = {
        id: evt._id?.toString() || entryId,
        timestamp: evt.at?.getTime() || Date.now(),
        actor: {
          id: evt.actorKid || evt.actorSub || 'unknown', // Prefer invariable kid
          type: 'user',
        },
        operation: evt.action,
        resource: {
          type: evt.resourceType,
          id: evt.resourceRef || 'unknown',
        },
        status: evt.result === 'allow' ? 'success' : 'failure',
        requestId: evt.requestId,
        error: evt.reason
          ? { code: 'AUDIT_ERROR', message: evt.reason }
          : undefined,
      };

      this.emitEvent('get-entry', 'completed', Date.now() - startTime, entryId);

      return Result.ok(entry);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get audit entry: ${err.message}`, err.stack);

      const auditError: AuditError = {
        name: 'AuditError',
        message: err.message,
        code: 'AUDIT_GET_FAILED',
        statusCode: 500,
      };

      this.emitEvent('get-entry', 'failed', Date.now() - startTime, entryId);
      return Result.fail(auditError);
    }
  }

  /**
   * Archive old audit entries.
   */
  async archive(beforeDate: number): Promise<Result<number>> {
    const startTime = Date.now();

    try {
      const result = await this.auditModel
        .deleteMany({ timestamp: { $lt: beforeDate } })
        .exec();

      this.logger.log(`Archived ${result.deletedCount} audit entries`);

      this.emitEvent('archive', 'completed', Date.now() - startTime);

      return Result.ok(result.deletedCount || 0);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to archive audit entries: ${err.message}`,
        err.stack,
      );

      const auditError: AuditError = {
        name: 'AuditError',
        message: err.message,
        code: 'AUDIT_ARCHIVE_FAILED',
        statusCode: 500,
      };

      this.emitEvent('archive', 'failed', Date.now() - startTime);
      return Result.fail(auditError);
    }
  }

  /**
   * Redact sensitive data from entry.
   */
  private redactSensitiveData(entry: AuditLogEntry): AuditLogEntry {
    const redacted = JSON.parse(JSON.stringify(entry));

    this.redactObjectFields(redacted.changes?.before);
    this.redactObjectFields(redacted.changes?.after);
    this.redactObjectFields(redacted);

    return redacted;
  }

  /**
   * Recursively redact sensitive fields from object.
   */
  private redactObjectFields(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      if (
        this.sensitiveFields.some((field) => key.toLowerCase().includes(field))
      ) {
        obj[key] = '***REDACTED***';
      } else if (typeof obj[key] === 'object') {
        this.redactObjectFields(obj[key]);
      }
    }
  }

  private emitEvent(
    operation: 'log' | 'query' | 'get-entry' | 'archive',
    status: 'completed' | 'failed',
    duration: number,
    entryId?: string,
    actorId?: string,
    resourceType?: string,
    error?: Error,
  ): void {
    const event = new AuditOperationEvent(
      operation,
      status,
      duration,
      entryId,
      actorId,
      resourceType,
      error,
      this.asyncContext.getRequestId(),
    );
    this.eventEmitter.emit('audit.operation', event);
  }
}
