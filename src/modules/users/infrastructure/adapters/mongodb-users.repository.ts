import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from '../schemas/user.schema';
import type {
  CreateUserPayload,
  UpdateUserRolesPayload,
  UpdateUserPasswordPayload,
} from '../../domain/ports/users.port';
import { UserStatus } from '../../domain/enums';

export interface IUsersRepository {
  /**
   * Crear usuario.
   */
  create(payload: CreateUserPayload): Promise<UserDocument>;

  /**
   * Obtener usuario por ID.
   * @param id
   */
  findById(id: string): Promise<UserDocument | null>;

  /**
   * Obtener usuario por email.
   * @param email
   */
  findByEmail(email: string): Promise<UserDocument | null>;

  /**
   * Obtener todos los usuarios activos.
   */
  findAll(): Promise<UserDocument[]>;

  /**
   * Actualizar roles del usuario.
   * @param id
   * @param payload
   */
  updateRoles(
    id: string,
    payload: UpdateUserRolesPayload,
  ): Promise<UserDocument | null>;

  /**
   * Actualizar contraseña del usuario.
   * @param id
   * @param payload
   */
  updatePassword(
    id: string,
    payload: UpdateUserPasswordPayload,
  ): Promise<UserDocument | null>;

  /**
   * Actualizar datos del usuario (email, fullname, phone, etc).
   * @param id
   * @param payload
   */
  updateUser(id: string, payload: any): Promise<UserDocument | null>;

  /**
   * Deshabilitar usuario (soft delete).
   * @param id
   */
  disable(id: string): Promise<boolean>;
}

/**
 * Adaptador MongoDB para Users.
 * Implementa el patrón Repository, aislando la lógica de persistencia.
 */
@Injectable()
export class MongoDbUsersRepository implements IUsersRepository {
  private readonly logger = new Logger(MongoDbUsersRepository.name);

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /**
   * Crear usuario.
   */
  async create(payload: Partial<UserDocument>): Promise<UserDocument> {
    const user = await this.userModel.create({
      userId: payload.userId,
      email: payload.email,
      fullname: payload.fullname,
      roleKey: payload.roleKey,
      additionalRoleKeys: payload.additionalRoleKeys || [], // ⭐ NUEVO
      phone: payload.phone,
      idNumber: payload.idNumber,
      passwordHash: payload.passwordHash,
      metadata: payload.metadata,
      status: UserStatus.ACTIVE,
    });

    return user.populate(this.populateOptions());
  }

  /**
   * Obtener usuario por ID.
   */
  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ id, status: UserStatus.ACTIVE })
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Obtener usuario por email.
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email, status: UserStatus.ACTIVE })
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Obtener usuario por phone.
   */
  async findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ phone, status: UserStatus.ACTIVE })
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Obtener todos los usuarios activos.
   */
  async findAll(): Promise<UserDocument[]> {
    return this.userModel
      .find({ status: UserStatus.ACTIVE })
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Actualizar rol.
   */
  async updateRoles(
    id: string,
    payload: UpdateUserRolesPayload,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(
        { id, status: UserStatus.ACTIVE },
        {
          $set: {
            roleKey: payload.roleKey,
            additionalRoleKeys: payload.additionalRoleKeys || [], // ⭐ NUEVO
          },
        },
        { new: true },
      )
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Actualizar contraseña.
   */
  async updatePassword(id: string, payload: any): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate(
        { id, status: UserStatus.ACTIVE },
        { $set: { passwordHash: payload.passwordHash } },
        { new: true },
      )
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Actualizar datos del usuario (email, fullname, phone, etc).
   */
  async updateUser(id: string, payload: any): Promise<UserDocument | null> {
    const updateData: Record<string, any> = {};

    if (payload.email !== undefined) {
      updateData.email = payload.email;
    }
    if (payload.phone !== undefined) {
      updateData.phone = payload.phone;
    }
    if (payload.fullname !== undefined) {
      updateData.fullname = payload.fullname;
    }
    if (payload.metadata !== undefined) {
      updateData.metadata = payload.metadata;
    }

    return this.userModel
      .findOneAndUpdate(
        { id, status: UserStatus.ACTIVE },
        { $set: updateData },
        { new: true },
      )
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Deshabilitar usuario (soft delete).
   */
  async disable(id: string): Promise<boolean> {
    const result = await this.userModel.updateOne(
      { id, status: UserStatus.ACTIVE },
      { $set: { status: UserStatus.DISABLED } },
    );

    return result.matchedCount > 0;
  }

  /**
   * Opciones de populate para rellenar la propiedad role.
   * Centraliza la configuración de populate en un solo lugar.
   */
  private populateOptions() {
    return {
      path: 'role',
      model: 'Role',
      select: [
        'id',
        'name',
        'key',
        'permissionKeys',
        'description',
        'isSystem',
      ],
    };
  }
}
