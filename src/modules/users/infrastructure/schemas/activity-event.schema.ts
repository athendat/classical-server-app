import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ActivityEventType } from '../../domain/enums';

/**
 * Evento de actividad de usuario.
 * Registra acciones importantes realizadas por el usuario.
 */
@Schema({ _id: false })
export class ActivityEvent {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  timestamp: Date;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(ActivityEventType),
  })
  type: ActivityEventType;
}

export const ActivityEventSchema = SchemaFactory.createForClass(ActivityEvent);
