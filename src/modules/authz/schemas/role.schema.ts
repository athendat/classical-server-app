import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';


export type RoleDocument = HydratedDocument<Role>;

export enum RoleStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Schema({ timestamps: true, collection: 'roles' })
export class Role {

  @Prop({ required: true, unique: true, index: true, default: () => uuidv4() })
  id: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true, type: String, maxlength: 100 })
  name: string;

  @Prop({ type: String, trim: true, maxlength: 20 })
  icon?: string;

  @Prop({ type: String, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  assignedUsersCount?: number;

  @Prop({ required: true, type: [String], default: [] })
  permissionKeys: string[];

  @Prop({ required: true, default: false, immutable: true })
  isSystem: boolean;

  @Prop({
    required: true,
    enum: Object.values(RoleStatus),
    default: RoleStatus.ACTIVE,
  })
  status: RoleStatus;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

// Índices adicionales
RoleSchema.index({ status: 1 });
RoleSchema.index({ isSystem: 1 });
RoleSchema.index({ permissionKeys: 1 });
