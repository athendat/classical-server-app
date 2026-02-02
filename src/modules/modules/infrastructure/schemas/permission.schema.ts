import { Schema, Prop } from '@nestjs/mongoose';

/**
 * Sub-schema para Permission embebido en Module
 */
@Schema({ _id: false })
export class PermissionSchema {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  indicator: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: String, required: false, default: null })
  icon?: string;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: Boolean, default: false })
  requiresSuperAdmin?: boolean;
}
