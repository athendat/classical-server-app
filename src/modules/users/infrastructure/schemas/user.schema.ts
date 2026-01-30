import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { ActivityEvent, ActivityEventSchema } from './activity-event.schema';
import { SecurityInfo, SecurityInfoSchema } from './security-info.schema';

import { UserStatus } from '../../domain/enums';
import { Role } from 'src/modules/authz/schemas/role.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, index: true, default: () => uuidv4() })
  id: string;

  @Prop({ type: String, trim: true })
  email?: string;

  @Prop({ type: Boolean, default: false })
  emailVerified?: boolean;

  @Prop({ type: String })
  passwordHash?: string;

  @Prop({ type: String, required: true })
  fullname: string;

  @Prop({ type: String, required: true })
  idNumber: string;

  @Prop({ type: String })
  initials?: string;

  @Prop({ type: String, required: true })
  phone: string;

  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({ type: String })
  roleKey?: string;

  @Prop({ type: String, required: false, ref: 'User' })
  userId?: string;

  @Prop({ type: String, required: true, ref: 'Role' })
  roleId: string;

  @Prop({ type: Boolean, default: false })
  isSystemAdmin?: boolean;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Prop({ type: SecurityInfoSchema, default: { apiCalls30d: 0 } })
  security?: SecurityInfo;

  @Prop({ type: [ActivityEventSchema], default: [] })
  recentActivity?: ActivityEvent[];

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ type: Date, default: Date.now })
  createdAt?: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt?: Date;

  @Prop({ type: Date })
  lastActive?: Date;

  role?: Role;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Índices adicionales
UserSchema.index({ status: 1 });
UserSchema.index({ roleId: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastActive: -1 });

UserSchema.virtual('role', {
  ref: 'Role',
  localField: 'roleId',
  foreignField: 'id',
  justOne: true,
});

// Hook de pre-save para generar el inciales
UserSchema.pre('save', function (this: UserDocument) {
  if (this.fullname) {
    const names = this.fullname.trim().split(' ');
    if (names.length === 1) {
      this.initials = names[0].charAt(0).toUpperCase();
    } else {
      this.initials =
        names[0].charAt(0).toUpperCase() +
        names[names.length - 1].charAt(0).toUpperCase();
    }
  }
});
