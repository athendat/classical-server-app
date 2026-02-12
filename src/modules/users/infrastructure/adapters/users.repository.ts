import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';

import { User, UserDocument } from '../schemas/user.schema';
import type {
  UpdateUserRolesPayload,
  IUsersPort,
} from '../../domain/ports/users.port';
import { UserStatus } from '../../domain/enums/enums';

/**
 * Adaptador MongoDB para Users.
 * Implementa el patrón Repository, aislando la lógica de persistencia.
 */
@Injectable()
export class UsersRepository implements IUsersPort {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

  /**
   * Crear usuario.
   */
  async create(payload: Partial<UserDocument>): Promise<User> {
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
  async findById(id: string): Promise<User | null> {
    return this.userModel
      .findOne({ id })
      .populate(this.populateOptions())
      .populate({
        path: 'recentActivity',
        model: 'AuditEvent',
        select: [
          'id',
          'at', 
          'requestId', 
          'ipAddress', 
          'userAgent', 
          'action', 
          'module', 
          'endpoint', 
          'result',
          'latency',
          'statusCode',
          'severity'
        ]
      })
      .exec();
  }

  /**
   * Obtener usuario por email.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel
      .findOne({ email, status: UserStatus.ACTIVE })
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Obtener usuario por phone.
   */
  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel
      .findOne({ phone, status: UserStatus.ACTIVE })
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Obtener todos los usuarios activos.
   */
  async findAll(
    filter: QueryFilter<User>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{
    data: User[];
    total: number,
    meta?: {
      active: number,
      inactive: number,
      suspended: number,
      roleKeys: string[],
      status: string[],
    }
  }> {
    try {
      this.logger.log(
        `Finding Users with filter: ${JSON.stringify(filter)}, skip=${options.skip}, limit=${options.limit}`,
      );

      // Ejecutar query en paralelo: obtener documentos y contar total
      const [users, total, active, inactive, suspended, roleKeys, status] = await Promise.all([
        this.userModel
          .find(filter as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .populate(this.populateOptions())
          .limit(options.limit)
          .lean()
          .exec(),
        this.userModel.countDocuments(filter as any).exec(),
        this.userModel.countDocuments({ status: UserStatus.ACTIVE }).exec(),
        this.userModel.countDocuments({ status: UserStatus.INACTIVE }).exec(),
        this.userModel.countDocuments({ status: UserStatus.SUSPENDED }).exec(),
        this.userModel.distinct('roleKey').exec(),
        this.userModel.distinct('status').exec(),
      ]);

      this.logger.log(
        `Found ${users.length} users (total: ${total}, skip: ${options.skip}, limit: ${options.limit})`,
      );

      return {
        data: users as User[],
        total,
        meta: {
          active,
          inactive,
          suspended,
          roleKeys: roleKeys.filter((key) => key !== 'super_admin') as string[],
          status
        }
      };
    } catch (error: any) {
      this.logger.error(
        `Error finding Tenants with filter: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new Error(
        `Find with filter failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Obtener usuarios por una lista de IDs.
   * @param ids 
   * @returns 
   */
  async findByIds(ids: string[]): Promise<User[]> {
    return this.userModel
      .find({ id: { $in: ids } })
      .select(
        {
          _id: 0,
          id: 1,
          fullname: 1,
        },
      )
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Actualizar rol.
   */
  async updateRoles(
    id: string,
    payload: UpdateUserRolesPayload,
  ): Promise<User | null> {
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
  async updatePassword(id: string, payload: any): Promise<User | null> {
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
  async updateUser(id: string, payload: any): Promise<User | null> {
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
   * Agregar tenantId al usuario (cuando se asigna un tenant).
   * Esto se llama desde TenantService cuando se crea un tenant y se asigna al usuario.
   */
  async addTenantIdToUser(userId: string, tenantId: string): Promise<User | null> {
    return this.userModel
      .findOneAndUpdate(
        { id: userId, status: UserStatus.ACTIVE },
        { $set: { tenantId } },
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
   * Actualizar estado del usuario
   */
  async updateStatus(id: string, newStatus: UserStatus): Promise<User | null> {
    return this.userModel
      .findOneAndUpdate(
        { id },
        { $set: { status: newStatus } },
        { new: true },
      )
      .populate(this.populateOptions())
      .exec();
  }

  /**
   * Obtener documento raw (usado internamente).
   */
  async findByIdRaw(id: string): Promise<User | null> {
    return this.userModel.findOne({ id }).exec();
  }

  /**
   * Verifica si un teléfono ya existe en la base de datos
   */
  async existsByPhone(phone: string): Promise<boolean> {
    try {
      const count = await this.userModel.countDocuments({ phone }).exec();
      return count > 0;
    } catch (error: any) {
      this.logger.error(`Error checking if phone exists ${phone}:`, error);
      return false;
    }
  }

  /**
   * Marca el teléfono de un usuario como confirmado
   */
  async markPhoneConfirmed(userId: string): Promise<void> {
    try {
      await this.userModel
        .findOneAndUpdate(
          { id: userId },
          { phoneConfirmed: true },
          { new: true },
        )
        .exec();

      this.logger.log(`Phone confirmed for user ${userId}`);
    } catch (error: any) {
      this.logger.error(
        `Error marking phone as confirmed for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Actualiza la contraseña de un usuario por teléfono
   */
  async updatePasswordByPhone(
    phone: string,
    passwordHash: string,
  ): Promise<void> {
    try {
      await this.userModel
        .findOneAndUpdate({ phone }, { passwordHash }, { new: true })
        .exec();

      this.logger.log(`Password updated for user with phone ${phone}`);
    } catch (error: any) {
      this.logger.error(
        `Error updating password for user with phone ${phone}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Opciones de populate para rellenar la propiedad role.
   * Centraliza la configuración de populate en un solo lugar.
   */
  private populateOptions() {
    return [
      {
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
      }, 
      {
        path: 'tenant',
        model: 'Tenant',
        select: ['id', 'name', 'nit', 'email', 'phone', 'businessAddress'],
      },
      {
        path: 'lifecycleHistory',
        model: 'UserLifecycle',
        select: ['id', 'userId', 'previousState', 'newState', 'reason', 'createdAt'],
      },
      {
        path: 'lastSession',
        model: 'Session',
        select: ['id', 'userId', 'status', 'loginTimestamp', 'logoutTimestamp'],
      }
    ];
  }
}
