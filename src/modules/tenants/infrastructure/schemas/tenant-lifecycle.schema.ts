import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { TenantStatus } from '../../domain/enums';

/**
 * Subdocumento para información del usuario que disparó la transición
 */
class TriggeredByInfo {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  username: string;

  @Prop({ type: String, required: true })
  roleKey: string;
}

/**
 * Schema para registrar cada transición de estado en el ciclo de vida del tenant
 * Se usa para auditoría y trazabilidad
 */
@Schema({
  timestamps: false,
  collection: 'tenant_lifecycles',
  versionKey: false,
})
export class TenantLifecycle extends AbstractSchema {
  /**
   * ID del tenant que cambió de estado
   */
  @Prop({
    type: String,
    required: true,
    index: true,
  })
  tenantId: string;

  /**
   * Estado anterior
   */
  @Prop({
    type: String,
    enum: Object.values(TenantStatus),
    required: true,
  })
  fromState: TenantStatus;

  /**
   * Estado nuevo
   */
  @Prop({
    type: String,
    enum: Object.values(TenantStatus),
    required: true,
    index: true,
  })
  toState: TenantStatus;

  /**
   * Información del usuario que disparó la transición
   */
  @Prop({
    type: Object,
    required: true,
  })
  triggeredBy: TriggeredByInfo;

  /**
   * Comentario opcional sobre la transición
   * Ej: "Se solicitan documentos fiscales adicionales"
   */
  @Prop({
    type: String,
    required: false,
  })
  comment?: string;

  /**
   * Timestamp exacto de la transición
   */
  @Prop({
    type: Date,
    default: Date.now,
    required: true,
    index: true,
  })
  timestamp: Date;

  /**
   * Snapshot completo de la máquina de estados en el momento de la transición
   * Usado para debugging y auditoría
   */
  @Prop({
    type: Object,
    required: false,
  })
  xstateSnapshot?: Record<string, any>;
}

export type TenantLifecycleDocument = HydratedDocument<TenantLifecycle>;
export const TenantLifecycleSchema =
  SchemaFactory.createForClass(TenantLifecycle);

/**
 * Crear índices para optimización de queries
 */
TenantLifecycleSchema.index({ tenantId: 1, timestamp: -1 });
TenantLifecycleSchema.index({ toState: 1 });
TenantLifecycleSchema.index({ timestamp: 1 });
