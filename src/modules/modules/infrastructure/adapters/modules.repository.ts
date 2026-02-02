import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { IModulesRepository } from '../../domain/ports';

import { Module as ModuleSchema } from '../schemas/module.schema';

import { ModuleEntity } from '../../domain/module.entity';

/**
 * Implementación de IModulesRepository usando MongoDB
 */
@Injectable()
export class ModulesRepository implements IModulesRepository {
  constructor(
    @InjectModel('Module')
    private readonly model: Model<ModuleSchema>,
  ) {}

  async create(module: ModuleEntity): Promise<ModuleEntity> {
    const created = await this.model.create(module);
    return this.mapToEntity(created);
  }

  async findAll(): Promise<ModuleEntity[]> {
    const modules = await this.model.find({ status: 'active' }).exec();
    return modules.map((m) => this.mapToEntity(m));
  }

  async findAllIncludingDisabled(): Promise<ModuleEntity[]> {
    const modules = await this.model.find().exec();
    return modules.map((m) => this.mapToEntity(m));
  }

  async findById(id: string): Promise<ModuleEntity | null> {
    const module = await this.model.findOne({ id }).exec();
    return module ? this.mapToEntity(module) : null;
  }

  async findByIndicator(indicator: string): Promise<ModuleEntity | null> {
    const module = await this.model
      .findOne({ indicator: indicator.toLowerCase() })
      .exec();
    return module ? this.mapToEntity(module) : null;
  }

  async update(
    id: string,
    moduleData: Partial<ModuleEntity>,
  ): Promise<ModuleEntity | null> {
    const updated = await this.model
      .findOneAndUpdate({ id }, moduleData, { new: true })
      .exec();
    return updated ? this.mapToEntity(updated) : null;
  }

  async disable(id: string): Promise<ModuleEntity | null> {
    const updated = await this.model
      .findOneAndUpdate({ id }, { status: 'disabled' }, { new: true })
      .exec();
    return updated ? this.mapToEntity(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return !!result;
  }

  async findSystemModules(): Promise<ModuleEntity[]> {
    const modules = await this.model.find({ isSystem: true }).exec();
    return modules.map((m) => this.mapToEntity(m));
  }

  async count(): Promise<number> {
    return this.model.countDocuments({ status: 'active' }).exec();
  }

  /**
   * Mapea documento Mongoose a entidad Module
   */
  private mapToEntity(doc: ModuleSchema): ModuleEntity {
    return new ModuleEntity({
      id: doc.id,
      indicator: doc.indicator,
      parent: doc.parent,
      name: doc.name,
      type: doc.type,
      order: doc.order,
      description: doc.description,
      icon: doc.icon,
      actions: doc.actions,
      permissions: doc.permissions || [],
      status: doc.status,
      isSystem: doc.isSystem,
      children: doc.children || [],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
