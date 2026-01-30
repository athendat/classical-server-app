import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PermissionDocument = Permission & Document;

export enum PermissionStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
}

@Schema({ timestamps: true, collection: 'permissions' })
export class Permission {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  key: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, lowercase: true })
  resource: string;

  @Prop({ required: false, lowercase: true })
  icon: string;

  @Prop({ required: true, lowercase: true })
  action: string;

  @Prop({ required: true, default: false, immutable: true })
  isSystem: boolean;

  @Prop({
    required: true,
    enum: Object.values(PermissionStatus),
    default: PermissionStatus.ACTIVE,
  })
  status: PermissionStatus;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);

// Índices adicionales
PermissionSchema.index({ resource: 1, action: 1 });
PermissionSchema.index({ status: 1 });
PermissionSchema.index({ isSystem: 1 });
