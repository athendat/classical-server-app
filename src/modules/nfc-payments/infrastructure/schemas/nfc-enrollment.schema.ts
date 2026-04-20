/**
 * Mongoose Schema: NfcEnrollment
 *
 * Persistencia de enrollments NFC para pagos sin contacto.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';

export type NfcEnrollmentDocument = HydratedDocument<NfcEnrollment>;

@Schema({ collection: 'nfc_enrollments', timestamps: true })
export class NfcEnrollment extends AbstractSchema {
  // Re-declare userId here so Mongo keeps it required without triggering TS2612 on the inherited property.
  @Prop({ type: String, required: true, ref: 'User', index: true })
  declare userId: string;

  @Prop({ required: true, unique: true, index: true })
  cardId: string;

  @Prop({ required: true })
  devicePublicKey: string; // Base64 of 65-byte uncompressed P-256

  @Prop({ required: true })
  serverPublicKey: string; // Base64 of 65-byte uncompressed P-256

  @Prop({ required: true })
  vaultKeyPath: string; // Path in Vault where root seed is stored

  @Prop({ required: true, default: 0 })
  counter: number; // Monotonic transaction counter

  @Prop({ required: true, default: 'active' })
  status: string; // 'active' | 'revoked'

  @Prop()
  revokedAt?: Date;
}

export const NfcEnrollmentSchema = SchemaFactory.createForClass(NfcEnrollment);

// Additional indexes for query optimization
NfcEnrollmentSchema.index({ userId: 1, status: 1 });
NfcEnrollmentSchema.index({ cardId: 1, status: 1 });
