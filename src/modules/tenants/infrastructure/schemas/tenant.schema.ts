import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { WebhookSchema } from './webhook.schema';
import { AddressSchema } from './address.schema';

import { Address, Webhook, TenantStatus, OAuth2ClientCredentials } from '../../domain';
import { OAuth2ClientCredentialsSchema } from './oauth2-client-credentials.schema';




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
    type: AddressSchema,
    required: true,
  })
  businessAddress: Address;

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
  })
  status: TenantStatus;

  /**
   * Información adicional o notas
   */
  @Prop({
    type: String,
    required: false,
  })
  notes?: string;

  /**
   * Webhooks configurados para este tenant
   * Array de configuraciones de webhook con URLs, events, y secrets
   */
  @Prop({
    required: false,
    type: WebhookSchema,
    default: null,
  })
  webhook?: Webhook;

  /**
   * OAuth2 Client ID asociado al tenant (si aplica)
   */
  @Prop({
    required: false,
    type: OAuth2ClientCredentialsSchema,
    default: null,
  })
  oauth2ClientCredentials?: OAuth2ClientCredentials;

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
TenantSchema.index({ 'webhook.url': 1 }, { sparse: true }); // Para búsquedas de webhooks por URL

