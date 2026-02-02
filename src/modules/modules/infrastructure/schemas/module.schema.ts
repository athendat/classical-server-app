import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { ModuleEntity, Permission } from '../../domain/module.entity';
import { ModuleType } from '../../domain/module-type.enum';
import { AbstractSchema } from 'src/common/schemas/abstract.schema';
import { PermissionSchema } from './permission.schema';

export type ModuleDocument = HydratedDocument<Module>;

/**
 * Schema MongoDB para Module
 */
@Schema({
  collection: 'modules',
  timestamps: true,
})
export class Module extends AbstractSchema {
  @Prop({ type: String, required: false, default: '' })
  description: string;

  @Prop({ type: String, required: false, default: null })
  parent?: string;

  @Prop({
    type: String,
    enum: Object.values(ModuleType),
    default: ModuleType.basic,
    index: true,
  })
  type: ModuleType;

  @Prop({
    type: Number,
    required: false,
    default: 0,
    min: 0,
    index: true,
  })
  order: number;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: Boolean, default: false })
  requiresSuperAdmin?: boolean | undefined;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  indicator: string;

  @Prop({
    type: String,
    required: true,
  })
  name: string;

  @Prop({
    type: String,
    required: true,
  })
  icon: string;

  @Prop({
    type: [String],
    required: true,
    lowercase: true,
  })
  actions: string[];

  @Prop({
    type: [PermissionSchema],
    default: [],
  })
  permissions: Permission[];

  @Prop({
    type: String,
    enum: ['active', 'disabled'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'disabled';

  @Prop({
    type: Boolean,
    default: false,
    index: true,
  })
  isSystem: boolean;

  @Prop({
    type: Boolean,
    default: true,
    index: true,
  })
  isNavigable: boolean;

  @Prop({
    type: [Object],
    default: [],
  })
  children?: ModuleEntity[];
}

export const ModuleSchema = SchemaFactory.createForClass(Module);

/**
 * Índices para optimizar queries
 */
ModuleSchema.index({ createdAt: -1 });

/**
 * Pre-save hook: Validación y normalización adicional
 */
ModuleSchema.pre('save', async function () {
  if (this.indicator) {
    this.indicator = this.indicator.toLowerCase().trim();
  }

  if (this.parent) {
    this.parent = this.parent.toLowerCase().trim();
  }

  if (this.actions && Array.isArray(this.actions)) {
    // Normalizar a lowercase y eliminar duplicados
    this.actions = [
      ...new Set(this.actions.map((a) => a.toLowerCase().trim())),
    ];
  }

  return Promise.resolve();
});

/**
 * Índice compuesto para queries eficientes de ordenamiento por categoría
 */
ModuleSchema.index({ parent: 1, order: 1 });
