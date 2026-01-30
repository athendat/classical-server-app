import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Información de seguridad del usuario.
 * Rastrea datos de seguridad como último login y llamadas API.
 */
@Schema({ _id: false })
export class SecurityInfo {
  @Prop({ type: Date })
  lastLogin?: Date;

  @Prop({ type: Number, default: 0 })
  apiCalls30d: number;
}

export const SecurityInfoSchema = SchemaFactory.createForClass(SecurityInfo);
