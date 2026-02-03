import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { AbstractSchema } from 'src/common/schemas/abstract.schema';

import { CardStatusEnum, CardTypeEnum } from '../../domain/enums';

export type CardDocument = HydratedDocument<Card>;

@Schema({
  collection: 'cards',
  timestamps: true,
})
export class Card extends AbstractSchema {

  @Prop({ required: true, enum: CardTypeEnum, type: String })
  cardType: CardTypeEnum;

  @Prop({
    required: true,
    enum: CardStatusEnum,
    type: String,
    default: CardStatusEnum.ACTIVE,
  })
  status: CardStatusEnum;

  @Prop({ required: true, type: String })
  lastFour: string;

  @Prop({ required: true, type: Number })
  expiryMonth: number;

  @Prop({ required: true, type: Number })
  expiryYear: number;

  @Prop({ type: String })
  ticketReference: string;

  @Prop({ required: true, type: Number, default: 0 })
  balance: number;
}

export const CardSchema = SchemaFactory.createForClass(Card);

// Compound unique index: one PERSONAL + one BUSINESS per user
CardSchema.index({ userId: 1, cardType: 1 }, { unique: true });
CardSchema.index({ userId: 1 });
CardSchema.index({ status: 1 });
