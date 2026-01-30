import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IModulesRepository } from '../../domain/ports';
import { Module } from '../../domain/module.entity';
import { ModuleSchema } from '../schemas/module.schema';

/**
 * Implementación de IModulesRepository usando MongoDB
 */
@Injectable()
export class MongoDBModulesRepository implements IModulesRepository {
  constructor(
    @InjectModel('Module') private readonly moduleModel: Model<ModuleSchema>,
  ) {}

  async create(module: Module): Promise<Module> {
    const created = await this.moduleModel.create(module);
    return this.mapToEntity(created);
  }

  async findAll(): Promise<Module[]> {
    const modules = await this.moduleModel.find({ status: 'active' }).exec();
    return modules.map((m) => this.mapToEntity(m));
  }

  async findAllIncludingDisabled(): Promise<Module[]> {
    const modules = await this.moduleModel.find().exec();
    return modules.map((m) => this.mapToEntity(m));
  }

  async findById(id: string): Promise<Module | null> {
    const module = await this.moduleModel.findOne({ id }).exec();
    return module ? this.mapToEntity(module) : null;
  }

  async findByIndicator(indicator: string): Promise<Module | null> {
    const module = await this.moduleModel
      .findOne({ indicator: indicator.toLowerCase() })
      .exec();
    return module ? this.mapToEntity(module) : null;
  }

  async update(
    id: string,
    moduleData: Partial<Module>,
  ): Promise<Module | null> {
    const updated = await this.moduleModel
      .findOneAndUpdate({ id }, moduleData, { new: true })
      .exec();
    return updated ? this.mapToEntity(updated) : null;
  }

  async disable(id: string): Promise<Module | null> {
    const updated = await this.moduleModel
      .findOneAndUpdate({ id }, { status: 'disabled' }, { new: true })
      .exec();
    return updated ? this.mapToEntity(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.moduleModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async findSystemModules(): Promise<Module[]> {
    const modules = await this.moduleModel.find({ isSystem: true }).exec();
    return modules.map((m) => this.mapToEntity(m));
  }

  async count(): Promise<number> {
    return this.moduleModel.countDocuments({ status: 'active' }).exec();
  }

  /**
   * Mapea documento Mongoose a entidad Module
   */
  private mapToEntity(doc: ModuleSchema): Module {
    return new Module({
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
