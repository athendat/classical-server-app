import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { IRolesRepository } from '../../domain/roles.repository';

import { Role as RoleSchema } from '../schemas/role.schema';

import { RoleStatus } from '../../domain/role.enums';
import { Role } from '../../domain/role.entity';

/**
 * RolesRepository - Adaptador de persistencia para roles en MongoDB
 * Implementa IRolesRepository
 */
@Injectable()
export class RolesRepository implements IRolesRepository {
  private readonly logger = new Logger(RolesRepository.name);

  constructor(
    @InjectModel(RoleSchema.name) private roleModel: Model<RoleSchema>,
  ) {}

  async create(role: Role): Promise<Role> {
    const roleDoc = new this.roleModel({
      ...role,
      id: role.id || uuidv4(),
    });
    const saved = await roleDoc.save();
    return this.mapToEntity(saved);
  }

  async findAll(): Promise<Role[]> {
    const roles = await this.roleModel
      .find({ status: RoleStatus.ACTIVE })
      .exec();
    return roles.map((r) => this.mapToEntity(r));
  }

  async findById(id: string): Promise<Role | null> {
    const role = await this.roleModel.findOne({ id }).exec();
    return role ? this.mapToEntity(role) : null;
  }

  async findByKey(key: string): Promise<Role | null> {
    const role = await this.roleModel
      .findOne({ key: key.toLowerCase().trim() })
      .exec();
    return role ? this.mapToEntity(role) : null;
  }

  async update(id: string, updates: Partial<Role>): Promise<Role | null> {
    const updated = await this.roleModel
      .findOneAndUpdate({ id }, updates, { new: true })
      .exec();
    return updated ? this.mapToEntity(updated) : null;
  }

  async disable(id: string): Promise<Role | null> {
    return this.update(id, { status: RoleStatus.DISABLED });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.roleModel.deleteOne({ id }).exec();
    return result.deletedCount > 0;
  }

  async findSystemRoles(): Promise<Role[]> {
    const roles = await this.roleModel.find({ isSystem: true }).exec();
    return roles.map((r) => this.mapToEntity(r));
  }

  async findByKeysAndStatus(
    keys: string[],
    status: RoleStatus,
  ): Promise<Role[]> {
    const roles = await this.roleModel
      .find({ key: { $in: keys }, status })
      .lean()
      .exec();
    return roles.map((r) => this.mapToEntity(r as RoleSchema));
  }

  private mapToEntity(doc: RoleSchema): Role {
    return new Role({
      id: doc.id,
      key: doc.key,
      name: doc.name,
      icon: doc.icon,
      description: doc.description,
      permissionKeys: doc.permissionKeys,
      assignedUsersCount: doc.assignedUsersCount,
      status: doc.status,
      isSystem: doc.isSystem,
    });
  }
}
