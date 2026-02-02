import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { CardStatusEnum } from '../../domain/enums';
import { HydratedDocument } from 'mongoose';

export type CardLifecycleDocument = HydratedDocument<CardLifecycle>;

@Schema({
  collection: 'card_lifecycle_events',
  timestamps: true,
})
export class CardLifecycle extends AbstractSchema {
  @Prop({ required: true, type: String })
  cardId: string;

  @Prop({ required: true, type: String, enum: CardStatusEnum })
  previousStatus: CardStatusEnum;

  @Prop({ required: true, type: String, enum: CardStatusEnum })
  newStatus: CardStatusEnum;

  @Prop({ type: String })
  reason: string;

  @Prop({ type: String })
  triggeredBy: string;
}

export const CardLifecycleSchema = SchemaFactory.createForClass(CardLifecycle);

CardLifecycleSchema.index({ cardId: 1, createdAt: -1 });
CardLifecycleSchema.index({ userId: 1, createdAt: -1 });
