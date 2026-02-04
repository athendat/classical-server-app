import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

import { AbstractSchema } from 'src/common/schemas/abstract.schema';

import { TransactionStatus } from '../../domain/entities/transaction.entity';

export type TransactionDocument = HydratedDocument<TransactionSchema>;

/**
 * Schema: Transacción de pago
 * Extiende AbstractSchema para tener id, createdAt, updatedAt automáticos
 */
@Schema({ collection: 'transactions', timestamps: true })
export class TransactionSchema extends AbstractSchema {
  @Prop({ required: true, index: true })
  ref: string; // Referencia del cliente (orden)

  @Prop({ required: true, unique: true, sparse: true })
  intentId: string; // UUID v4 para idempotencia (evitar duplicados)

  @Prop({ required: true, unique: true, sparse: true })
  no: number; // Número secuencial universal

  @Prop({ required: true, index: true, type: String, ref: 'Tenant' })
  tenantId: string; // Tenant propietario

  @Prop({ required: true })
  tenantName: string; // Nombre del tenant para QR

  @Prop({ required: false, type: String, ref: 'User' })
  customerId: string; // Cliente

  @Prop({ required: true })
  amount: number; // Monto en centavos

  @Prop({ enum: Object.values(TransactionStatus), default: TransactionStatus.NEW, index: true })
  status: TransactionStatus; // Estado actual

  @Prop({ sparse: true })
  cardId?: string; // Tarjeta usada (se llena en confirmación)

  @Prop({ required: true })
  ttlMinutes: number; // Tiempo de vida en minutos

  @Prop({ required: true, index: true })
  expiresAt: Date; // Cuándo expira la transacción

  @Prop({ required: true })
  signature: string; // Firma HMAC del QR

  @Prop({ type: Object, sparse: true })
  stateSnapshot?: Record<string, any>; // Snapshot de máquina de estados

  @Prop({ sparse: true, index: true })
  processedAt?: Date; // Cuándo se procesó
}

export const TransactionSchemaFactory = SchemaFactory.createForClass(TransactionSchema);

// Índices para optimización de queries
TransactionSchemaFactory.index({ tenantId: 1, createdAt: -1 });
TransactionSchemaFactory.index({ customerId: 1, createdAt: -1 });
TransactionSchemaFactory.index({ status: 1, expiresAt: 1 }); // Para buscar expiradas
TransactionSchemaFactory.index({ tenantId: 1, ref: 1 }); // Unicidad compuesta por tenant
TransactionSchemaFactory.index({ tenantId: 1, intentId: 1 }); // Para idempotencia por tenant
TransactionSchemaFactory.index({ createdAt: -1 }); // Para paginación general
