/**
 * Enumeraciones de dominio del módulo de usuarios.
 * Contiene los estados y tipos de eventos de los usuarios.
 */

/**
 * Estados posibles de un usuario.
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DISABLED = 'disabled',
}

/**
 * Tipos de eventos registrados en la actividad reciente del usuario.
 */
export enum ActivityEventType {
  AUTH = 'auth',
  SECURITY = 'security',
  SETTINGS = 'settings',
  SYSTEM = 'system',
}
