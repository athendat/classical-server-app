/**
 * Mongoose Schema: DeviceKey
 * 
 * Persistencia de claves ECDH P-256 intercambiadas con dispositivos móviles.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument, Types } from 'mongoose';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { DeviceKeyStatus } from '../../domain/models/device-key.model';

export type DeviceKeyDocument = HydratedDocument<DeviceKey>;
@Schema({ timestamps: true, collection: 'device_keys' })
export class DeviceKey extends AbstractSchema {
  @Prop({ required: true, unique: true, index: true })
  deviceId: string;

  @Prop({ required: true, unique: true, index: true })
  keyHandle: string;

  @Prop({ required: true, minlength: 88, maxlength: 88 })
  devicePublicKey: string;

  @Prop({ required: true, minlength: 88, maxlength: 88 })
  serverPublicKey: string;

  @Prop({ required: true })
  saltHex: string;

  @Prop({
    required: true,
    enum: Object.values(DeviceKeyStatus),
    default: DeviceKeyStatus.ACTIVE,
    index: true,
  })
  status: DeviceKeyStatus;

  @Prop({ required: true })
  issuedAt: Date;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ required: true, enum: ['android', 'ios'] })
  platform: 'android' | 'ios';

  @Prop({ required: true })
  appVersion: string;

  @Prop({ required: false })
  deviceName?: string;

  // Indexes para queries optimizadas
  // { deviceId: 1, userId: 1 } - búsqueda por usuario y dispositivo
  // { keyHandle: 1 } - búsqueda por key_handle (already added as unique)
  // { expiresAt: 1, status: 1 } - para queries de limpieza/rotación
  // TTL index opcional en expiresAt
}

export const DeviceKeySchema = SchemaFactory.createForClass(DeviceKey);

// Índices adicionales para optimización
DeviceKeySchema.index({ deviceId: 1, userId: 1 });
DeviceKeySchema.index({ userId: 1, status: 1 });
DeviceKeySchema.index({ expiresAt: 1, status: 1 });

// TTL Index: eliminar automáticamente documentos expirados después de 7 días
// Comentado por defecto para evitar pérdidas inesperadas; descomenta si la política lo permite
// DeviceKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 }); // 7 días

