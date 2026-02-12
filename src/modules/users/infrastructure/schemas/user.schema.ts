import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

import { ActivityEvent, ActivityEventSchema } from './activity-event.schema';
import { SecurityInfo, SecurityInfoSchema } from './security-info.schema';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';

import { UserStatus } from '../../domain/enums/enums';
import { Role } from 'src/modules/roles/domain';
import { Tenant } from 'src/modules/tenants/infrastructure/schemas/tenant.schema';
import { UserLifecycle } from './user-lifecycle.schema';
import { AuditEvent } from 'src/modules/audit/schemas/audit-event.schema';
import { Session } from 'src/modules/auth/infrastructure/schemas/session.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User extends AbstractSchema {

  @Prop({ type: String, required: false, ref: 'Tenant' })
  tenantId?: string;

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

  @Prop({ type: Boolean, default: false })
  phoneConfirmed?: boolean;

  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({ type: String, required: true, ref: 'Role' })
  roleKey: string;

  @Prop({ type: [String], default: [], ref: 'Role' })
  additionalRoleKeys?: string[];

  @Prop({ type: Boolean, default: false })
  isSystemAdmin?: boolean;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;
  
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  lastSession?: Session;

  recentActivity?: AuditEvent[];

  lifecycleHistory?: UserLifecycle[];

  role?: Role;

  tenant?: Tenant;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Índices adicionales
UserSchema.index({ status: 1 });
UserSchema.index({ roleId: 1 });
UserSchema.index({ tenantId: 1 });
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastActive: -1 });
UserSchema.index({ roleKey: 1, additionalRoleKeys: 1 });

UserSchema.virtual('role', {
  ref: 'Role',
  localField: 'roleKey',
  foreignField: 'key',
  justOne: true,
});

UserSchema.virtual('tenant', {
  ref: 'Tenant',
  localField: 'tenantId',
  foreignField: 'id',
  justOne: true,
});

UserSchema.virtual('lifecycleHistory', {
  ref: 'UserLifecycle',
  localField: 'id',
  foreignField: 'userId',
  justOne: false,
});

UserSchema.virtual('recentActivity', {
  ref: 'AuditEvent',
  localField: 'id',
  foreignField: 'userId',
  justOne: false,
  options: { sort: { timestamp: -1 }, limit: 10 },
});

UserSchema.virtual('lastSession', {
  ref: 'Session',
  localField: 'id',
  foreignField: 'userId',
  justOne: true,
  options: { sort: { loginTimestamp: -1 }, limit: 1 },
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
