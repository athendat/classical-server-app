import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export type ServiceDocument = Service & Document;

export enum ServiceStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Schema({ timestamps: true, collection: 'services' })
export class Service {
  @Prop({ required: true, unique: true, index: true, default: () => uuidv4() })
  id: string;

  @Prop({ required: true, unique: true, trim: true })
  serviceId: string;

  @Prop({ type: String })
  fullname?: string;

  @Prop({ required: true, type: [String], default: [] })
  roleKeys: string[];

  @Prop({ type: [String], default: [] })
  allowedAudiences?: string[];

  @Prop({
    required: true,
    enum: Object.values(ServiceStatus),
    default: ServiceStatus.ACTIVE,
  })
  status: ServiceStatus;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

// Índices adicionales
ServiceSchema.index({ status: 1 });
ServiceSchema.index({ roleKeys: 1 });
