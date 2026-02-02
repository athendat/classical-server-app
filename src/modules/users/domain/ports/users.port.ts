import type { ApiResponse } from 'src/common/types/api-response.type';

import type { UserStatus } from '../enums';
import { Role } from 'src/modules/roles/domain';

export interface CreateUserPayload {
  userId?: string;
  email?: string;
  fullname?: string;
  roleKey: string;
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
}

export interface UpdateUserPasswordPayload {
  password: string;
}

export interface UserDTO {
  id: string;
  idNumber: string;
  userId?: string;
  phone: string;
  phoneConfirmed?: boolean;
  email?: string;
  emailVerified?: boolean;
  fullname: string;
  roleKey: string;
  role?: Role;
  status: UserStatus;
  isSystemAdmin?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
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
  list(): Promise<ApiResponse<UserDTO[]>>;

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
