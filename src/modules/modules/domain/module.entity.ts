/**
 * Module Entity - Dominio
 * Representa un módulo de la plataforma con sus acciones y permisos asociados
 */

import { ModuleType } from './module-type.enum';

/**
 * Estructura de un Permiso dentro de un Módulo
 * Los permisos están embebidos en el módulo, no desnormalizados en otras colecciones
 */
export interface Permission {
  /**
   * ID único del permiso (auto-generado, ej: "gw_v", "tm_c")
   */
  id: string;

  /**
   * Nombre legible del permiso (ej: "Ver Pasarelas", "Registrar Terminal")
   */
  name: string;

  /**
   * Indicador del permiso en formato module.action (ej: "gateways.view", "terminals.create")
   */
  indicator: string;

  /**
   * Descripción detallada del permiso, orientada al usuario
   */
  description: string;

  /**
   * Icono representativo del permiso (Material Symbol icon name)
   * Ej: "lock", "visibility", "edit"
   */
  icon?: string;

  /**
   * Estado del permiso: activo o desactivado
   */
  enabled: boolean;

  /**
   * Flag especial para permisos que requieren Super Admin
   * Ejemplo: "Approve High Value" o "Suspender Acceso"
   */
  requiresSuperAdmin?: boolean;
}

/**
 * Module Entity - Catálogo de módulos de la plataforma
 * Contiene la definición de módulos, acciones y permisos embebidos
 */
export class ModuleEntity {
  /**
   * ID MongoDB (ObjectId)
   */
  _id?: string;

  /**
   * UUID Auto generado del módulo
   */
  id: string;

  /**
   * ID del módulo padre (si aplica) para módulos jerárquicos
   */
  parent?: string;

  /**
   * Identificador único del módulo en formato lowercase con dashes
   * Ej: "gateways", "terminals", "transactions"
   */
  indicator: string;

  /**
   * Nombre legible del módulo
   */
  name: string;

  /**
   * Descripción completa del módulo y su propósito
   */
  description: string;

  /**
   * Tipo de módulo: basic (funcionalidad standalone) o group (agrupa funcionalidades)
   */
  type: ModuleType;

  /**
   * Orden de presentación del módulo en listados
   */
  order: number;

  /**
   * Material Symbol icon name (ej: "payments", "point_of_sale")
   */
  icon: string;

  /**
   * Array de acciones disponibles en el módulo (lowercase)
   * Ej: ['view', 'create', 'manage-secrets', 'webhooks', 'logs']
   * Se genera automáticamente el array de permisos a partir de estas acciones
   */
  actions: string[];

  /**
   * Array de permisos del módulo (embebido)
   * Se genera automáticamente al crear/editar el módulo
   * Estructura: { id, name, indicator, description, enabled, requiresSuperAdmin }
   */
  permissions: Permission[];

  /**
   * Estado del módulo: 'active' o 'disabled' (soft-delete)
   */
  status: 'active' | 'disabled';

  /**
   * Indica si es un módulo del sistema (inmutable)
   * Los módulos del sistema no pueden ser eliminados (hard-delete)
   */
  isSystem: boolean;

  /**
   * Indica si el módulo debe aparecer en navegación
   * Por defecto: true
   * Se utiliza junto con status: 'active' para filtrar módulos navegables
   * Un módulo puede estar activo pero no visible en navegación (ej: módulos internos)
   */
  isNavigable?: boolean;

  /**
   * Timestamp de creación
   */
  createdAt?: Date;

  /**
   * Timestamp de última actualización
   */
  updatedAt?: Date;

  /**
   * Sub módulos hijos (si es un módulo grupo)
   */
  children?: ModuleEntity[];

  constructor(partial?: Partial<ModuleEntity>) {
    Object.assign(this, partial);
  }
}
