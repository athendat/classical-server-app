import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';

import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { Module, Permission } from '../../domain/module.entity';
import { ModuleType } from '../../domain/module-type.enum';

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

/**
 * Schema MongoDB para Module
 */
@Schema({
    collection: 'modules',
    timestamps: true,
})
export class ModuleSchema extends Document implements Permission {
    @Prop({ required: true, unique: true, index: true, default: () => uuidv4() })
    id: string;

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

    @Prop({ type: [Module], default: [] })
    children?: Module[];

    @Prop({ type: Date, default: Date.now, index: true })
    createdAt: Date;

    @Prop({ type: Date, default: Date.now })
    updatedAt: Date;
}

export const ModuleSchemaFactory = SchemaFactory.createForClass(ModuleSchema);

/**
 * Índices para optimizar queries
 */
ModuleSchemaFactory.index({ createdAt: -1 });

/**
 * Pre-save hook: Validación y normalización adicional
 */
ModuleSchemaFactory.pre('save', async function () {
    if (this.indicator) {
        this.indicator = this.indicator.toLowerCase().trim();
    }

    if (this.parent) {
        this.parent = this.parent.toLowerCase().trim();
    }

    if (this.actions && Array.isArray(this.actions)) {
        // Normalizar a lowercase y eliminar duplicados
        this.actions = [...new Set(this.actions.map((a) => a.toLowerCase().trim()))];
    }

    return Promise.resolve();
});

/**
 * Índice compuesto para queries eficientes de ordenamiento por categoría
 */
ModuleSchemaFactory.index({ parent: 1, order: 1 });
