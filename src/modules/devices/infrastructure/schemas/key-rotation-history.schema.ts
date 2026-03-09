/**
 * Mongoose Schema: KeyRotationHistory
 * 
 * Auditoría de rotaciones de claves ECDH.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { KeyRotationReason } from '../../domain/models/key-rotation.model';

export type KeyRotationHistoryDocument = HydratedDocument<KeyRotationHistory>;

@Schema({ timestamps: true, collection: 'device_key_rotations' })
export class KeyRotationHistory extends AbstractSchema {
  @Prop({ required: true, index: true })
  deviceId: string;

  @Prop({ required: true })
  previousKeyHandle: string;

  @Prop({ required: true })
  newKeyHandle: string;

  @Prop({
    required: true,
    enum: Object.values(KeyRotationReason),
  })
  reason: KeyRotationReason;

  @Prop({ required: true })
  initiatedBy: string; // 'system' o userId

  @Prop({ required: true })
  rotatedAt: Date;
}

export const KeyRotationHistorySchema =
  SchemaFactory.createForClass(KeyRotationHistory);

// Índices para búsqueda eficiente
KeyRotationHistorySchema.index({ deviceId: 1, rotatedAt: -1 });
KeyRotationHistorySchema.index({ userId: 1, rotatedAt: -1 });
KeyRotationHistorySchema.index({ rotatedAt: 1 }); // Para limpieza de registros antiguos

