import type { ApiResponse } from 'src/common/types/api-response.type';

import type { UserStatus } from '../enums/enums';
import { Role } from 'src/modules/roles/domain';
import { User } from '../../infrastructure/schemas/user.schema';
import { QueryFilter } from 'mongoose';
import { QueryParams } from 'src/common/types';
import { AuditEvent } from 'src/modules/audit/schemas/audit-event.schema';
import { Session } from 'src/modules/auth/infrastructure/schemas/session.schema';
import { Tenant } from 'src/modules/tenants/infrastructure/schemas/tenant.schema';

export interface CreateUserPayload {
  userId?: string;
  email?: string;
  fullname?: string;
  roleKey: string;
  additionalRoleKeys?: string[];
  phone: string;
  idNumber?: string;
  password: string;
  metadata?: Record<string, any>;
}

export interface UpdateUserPayload {
  fullname?: string;
  phone?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

export interface UpdateUserRolesPayload {
  roleKey: string;
  additionalRoleKeys?: string[];
}

export interface UpdateUserPasswordPayload {
  password: string;
}

export interface UserDTO {
  fullname: string;
  id: string;
  idNumber: string;
  phone: string;
  roleKey: string;
  status: UserStatus;

  additionalRoleKeys?: string[];
  createdAt?: Date;
  email?: string;
  emailVerified?: boolean;
  initials?: string;
  isSystemAdmin?: boolean;
  lastSession?: Session;
  phoneConfirmed?: boolean;
  recentActivity?: AuditEvent[];
  role?: Role;
  tenant?: Tenant;
  updatedAt?: Date;
  userId?: string;
}

/**
 * Puerto de servicio de usuarios.
 * Define operaciones CRUD con patrón ApiResponse para auditoría end-to-end.
 */
export interface IUsersService {
  /**
   * Crear nuevo usuario con auditoría end-to-end.
   */
  create(payload: CreateUserPayload): Promise<ApiResponse<UserDTO>>;

  /**
   * Obtener usuario por ID con auditoría.
   */
  findById(userId: string): Promise<ApiResponse<UserDTO | null>>;

  /**
   * Obtener usuario por email con auditoría.
   */
  findByEmail(email: string): Promise<ApiResponse<UserDTO | null>>;

  /**
   * Listar todos los usuarios activos con auditoría.
   */
  list(queryParams: QueryParams): Promise<ApiResponse<UserDTO[]>>;

  /**
   * Actualizar roles de usuario con auditoría end-to-end.
   */
  updateRoles(
    userId: string,
    payload: UpdateUserRolesPayload,
  ): Promise<ApiResponse<UserDTO>>;

  /**
   * Actualizar contraseña de usuario con auditoría end-to-end.
   */
  updatePassword(
    userId: string,
    payload: UpdateUserPasswordPayload,
  ): Promise<ApiResponse<UserDTO>>;

  /**
   * Actualizar datos del usuario (email, fullname, phone) con auditoría end-to-end.
   */
  update(
    userId: string,
    payload: UpdateUserPayload,
  ): Promise<ApiResponse<UserDTO>>;

  /**
   * Deshabilitar usuario con auditoría end-to-end.
   */
  disable(userId: string): Promise<ApiResponse<void>>;

  /**
   * Obtener documento raw para acceso de bajo nivel.
   */
  findByIdRaw(userId: string): Promise<UserDTO | null>;

  /**
   * Hash de contraseña con Argon2.
   */
  hashPassword(password: string): Promise<string>;

  /**
   * Verificar contraseña contra hash.
   */
  verifyPassword(password: string, hash: string): Promise<boolean>;
}



export interface IUsersPort {
  /**
   * Crear usuario.
   */
  create(payload: CreateUserPayload): Promise<User>;

  /**
   * Obtener usuario por ID.
   * @param id
   */
  findById(id: string): Promise<User | null>;

  /**
   * Obtener usuario por email.
   * @param email
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Obtener todos los usuarios activos.
   */
  findAll(
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
  }>;

  /**
   * Actualizar roles del usuario.
   * @param id
   * @param payload
   */
  updateRoles(
    id: string,
    payload: UpdateUserRolesPayload,
  ): Promise<User | null>;

  /**
   * Actualizar contraseña del usuario.
   * @param id
   * @param payload
   */
  updatePassword(
    id: string,
    payload: UpdateUserPasswordPayload,
  ): Promise<User | null>;

  /**
   * Actualizar datos del usuario (email, fullname, phone, etc).
   * @param id
   * @param payload
   */
  updateUser(id: string, payload: any): Promise<User | null>;

  /**
   * Deshabilitar usuario (soft delete).
   * @param id
   */
  disable(id: string): Promise<boolean>;
}
