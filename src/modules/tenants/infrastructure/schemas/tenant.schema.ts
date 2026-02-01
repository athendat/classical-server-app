import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { TenantStatus } from '../../domain/enums';

/**
 * Subdocumento para dirección de negocio
 */
class BusinessAddress {
  @Prop({ type: String, required: true })
  address: string;

  @Prop({ type: String, required: true })
  city: string;

  @Prop({ type: String, required: true })
  state: string;

  @Prop({ type: String, required: true })
  zipCode: string;

  @Prop({ type: String, required: false })
  country?: string;
}

/**
 * Schema principal para Tenants (negocios registrados en la plataforma)
 */
@Schema({
  timestamps: true,
  collection: 'tenants',
  versionKey: false,
})
export class Tenant extends AbstractSchema {
  /**
   * Nombre del negocio
   */
  @Prop({
    type: String,
    required: true,
    maxlength: 255,
  })
  businessName: string;

  /**
   * Nombre del representante legal del negocio
   */
  @Prop({
    type: String,
    required: true,
    maxlength: 255,
  })
  legalRepresentative: string;

  /**
   * Dirección del negocio
   */
  @Prop({
    type: Object,
    required: true,
  })
  businessAddress: BusinessAddress;

  /**
   * Referencia a la clave en Vault donde se almacena el PAN
   * Formato: tenants/{tenantId}/pan
   */
  @Prop({
    type: String,
    required: true,
  })
  panVaultKeyId?: string;

  /**
   * Email del negocio (único)
   */
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email: string;

  /**
   * Teléfono de contacto del negocio
   */
  @Prop({
    type: String,
    required: true,
  })
  phone: string;

  /**
   * Estado actual del tenant en el ciclo de vida
   */
  @Prop({
    type: String,
    enum: Object.values(TenantStatus),
    default: TenantStatus.PENDING_REVIEW,
    required: true,
    index: true,
  })
  status: TenantStatus;

  /**
   * ID del usuario que creó el tenant
   */
  @Prop({
    type: String,
    required: true,
  })
  createdBy: string;

  /**
   * Información adicional o notas
   */
  @Prop({
    type: String,
    required: false,
  })
  notes?: string;

  maskedPan?: string;
  unmaskPan?: string;
}

export type TenantDocument = HydratedDocument<Tenant>;
export const TenantSchema = SchemaFactory.createForClass(Tenant);

/**
 * Crear índices para optimización de queries
 */
TenantSchema.index({ email: 1 });
TenantSchema.index({ status: 1 });
TenantSchema.index({ createdAt: 1 });
TenantSchema.index({ createdBy: 1 });
