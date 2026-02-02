import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { AbstractSchema } from 'src/common/schemas/abstract.schema';

export type AuditEventDocument = HydratedDocument<AuditEvent>;

export enum AuditEventResult {
  ALLOW = 'allow',
  DENY = 'deny',
  ERROR = 'error',
}

/**
 * HTTP Headers capturados para auditoría
 */
interface HttpHeaders {
  userAgent?: string;
  ipAddress?: string;
  referer?: string;
  [key: string]: any;
}

@Schema({ timestamps: true, collection: 'audit_events' })
export class AuditEvent extends AbstractSchema {
  // ===== TRAZABILIDAD =====
  @Prop({ required: true, index: true })
  requestId: string;

  @Prop({ required: true, index: true })
  at: Date;

  // ===== ACTOR =====
  /**
   * ⭐ actorKid: Identificador INVARIABLE del usuario/servicio
   * - Se usa para trazabilidad de auditoría
   * - Invariable en el tiempo (a diferencia de email)
   * - Requerido y indexado para queries rápidas
   */
  @Prop({ required: true, index: true })
  actorKid: string;

  /**
   * actorSub: Información adicional del usuario (puede cambiar)
   * - Típicamente el email o username
   * - Útil para contexto pero no para trazabilidad
   * - Opcional
   */
  @Prop({ type: String })
  actorSub?: string;

  @Prop({ type: [String] })
  actorScopes?: string[];

  @Prop({ type: String })
  ipAddress?: string;

  @Prop({ type: String })
  userAgent?: string;

  // ===== OPERACIÓN =====
  @Prop({ required: true })
  action: string;

  @Prop({ type: String })
  module?: string;

  @Prop({
    required: true,
    enum: Object.values(AuditEventResult),
  })
  result: AuditEventResult;

  @Prop({ type: String })
  reason?: string;

  // ===== RECURSO =====
  @Prop({ required: true })
  resourceType: string;

  @Prop({ type: String })
  resourceRef?: string;

  // ===== HTTP METADATA =====
  @Prop({ type: String })
  method?: string;

  @Prop({ type: String })
  endpoint?: string;

  @Prop({ type: Object })
  query?: Record<string, any>;

  @Prop({ type: Object })
  headers?: HttpHeaders;

  @Prop({ type: Object })
  payload?: Record<string, any>;

  @Prop({ type: Number })
  statusCode?: number;

  @Prop({ type: Number })
  latency?: number; // ms

  @Prop({ type: Object })
  response?: Record<string, any>;

  // ===== CAMBIOS =====
  @Prop({ type: Object })
  changesBefore?: Record<string, any>;

  @Prop({ type: Object })
  changesAfter?: Record<string, any>;

  // ===== ERROR =====
  @Prop({ type: String })
  errorCode?: string;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: String })
  errorStack?: string;

  // ===== COMPLIANCE =====
  @Prop({ type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  severity?: string;

  @Prop({ type: [String] })
  tags?: string[];
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);

// Índices adicionales para consultas comunes
AuditEventSchema.index({ actorKid: 1, at: -1 });
AuditEventSchema.index({ resourceType: 1, at: -1 });
AuditEventSchema.index({ result: 1, at: -1 });
AuditEventSchema.index({ requestId: 1, createdAt: -1 });
AuditEventSchema.index({ actorKid: 1, resourceType: 1, createdAt: -1 });

// TTL opcional (retención de 90 días; ajustar según compliance)
// AuditEventSchema.index({ at: 1 }, { expireAfterSeconds: 7776000 });
