import { RoleStatus } from './role.enums';

/**
 * Role Entity - Dominio
 * Representa un rol con sus permisos asociados
 */
export class Role {
  /**
   * ID único del rol (UUID)
   */
  id: string;

  /**
   * Identificador único del rol en formato lowercase con dashes
   * Ej: "admin", "editor", "viewer"
   */
  key: string;

  /**
   * Nombre legible del rol
   */
  name: string;

  /**
   * Material Symbol icon name (ej: "admin_panel_settings", "edit")
   */
  icon?: string;

  /**
   * Descripción completa del rol y su propósito
   */
  description?: string;

  /**
   * Array de claves de permisos asignados al rol
   * Ej: ['modules.read', 'modules.create', 'terminals.view']
   */
  permissionKeys: string[];

  /**
   * Contador de usuarios asignados a este rol
   */
  assignedUsersCount?: number;

  /**
   * Estado del rol: active/disabled
   */
  status: RoleStatus;

  /**
   * Flag para roles del sistema (immutable)
   */
  isSystem: boolean;

  /**
   * Timestamp de creación
   */
  createdAt?: Date;

  /**
   * Timestamp de última actualización
   */
  updatedAt?: Date;

  constructor(data: Partial<Role>) {
    Object.assign(this, data);
  }
}
