import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { TerminalType, TerminalStatus } from '../../domain/constants/terminal.constants';

export type TerminalDocument = HydratedDocument<Terminal>;

@Schema({ collection: 'terminals', timestamps: true })
export class Terminal extends AbstractSchema {
  @Prop({ required: true, unique: true, index: true, default: () => crypto.randomUUID() })
  terminalId: string;

  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: Object.values(TerminalType) })
  type: string;

  @Prop({ type: [String], required: true })
  capabilities: string[];

  @Prop({ required: true, default: TerminalStatus.ACTIVE, enum: Object.values(TerminalStatus) })
  status: string;

  @Prop({ type: Object })
  location?: { label: string; address?: string; latitude?: number; longitude?: number };

  @Prop()
  deviceSerial?: string;

  @Prop()
  deviceModel?: string;

  @Prop()
  deviceManufacturer?: string;

  @Prop({ required: true })
  oauthClientId: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop()
  revokedAt?: Date;
}

export const TerminalSchema = SchemaFactory.createForClass(Terminal);

// Additional indexes
TerminalSchema.index({ tenantId: 1, status: 1 });
TerminalSchema.index({ oauthClientId: 1 }, { unique: true });
TerminalSchema.index({ tenantId: 1, type: 1 });
