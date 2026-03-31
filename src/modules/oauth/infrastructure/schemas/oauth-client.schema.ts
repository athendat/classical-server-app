import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractSchema } from '../../../../common/schemas/abstract.schema';

export type OAuthClientDocument = HydratedDocument<OAuthClient>;

@Schema({ collection: 'oauth_clients', timestamps: true })
export class OAuthClient extends AbstractSchema {
  @Prop({ required: true, unique: true, index: true })
  clientId: string;

  @Prop({ required: true })
  clientSecretHash: string;

  @Prop({ required: true, index: true })
  merchantId: string;

  @Prop({ required: true })
  terminalName: string;

  @Prop({ type: [String], required: true })
  scopes: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date })
  revokedAt?: Date;
}

export const OAuthClientSchema = SchemaFactory.createForClass(OAuthClient);
