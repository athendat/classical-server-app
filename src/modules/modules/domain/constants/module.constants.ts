/**
 * Acciones estándar soportadas (CRUD + export + operaciones de llaves).
 * Formato: lowercase, extensible sin romper compatibilidad.
 */
export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  ENABLE: 'enable',
  DISABLE: 'disable',
  ASSIGN: 'assign',
  ROTATE: 'rotate',
  REVOKE: 'revoke',
  APPROVE: 'approve',
} as const;

/**
 * Módulos del sistema.
 * Los permisos se forman con `${MODULE}.${ACTION}` en lowercase.
 */
export const MODULES = {
  // Módulos públicos
  CHANGELOG: 'changelog',
  DOCUMENTATION: 'documentation',
  SUPPORT: 'support',
  CONTACT: 'contact',

  // Módulo inicial
  DASHBOARD: 'dashboard',

  // Módulos de negocio
  TERMINALS: 'terminals',
  MERCHANTS: 'merchants',
  CARDS: 'cards',
  TRANSACTIONS: 'transactions',
  TENANTS: 'tenants',

  // Módulos administrativos
  USERS: 'users',
  ROLES: 'roles',
  PERMISSIONS: 'permissions',

  // Módulos de auditoría y plataforma
  AUDIT: 'audit',
  ANALYTICS: 'analytics',
  KEYS: 'keys',
  VAULT: 'vault',
  MODULES: 'modules',
  SERVICES: 'services',
  EXTERNAL_SERVICE: 'external_service',
} as const;

/**
 * Normaliza permissionKey a lowercase.
 */
export function normalizePermissionKey(key: string): string {
  return key.toLowerCase().trim();
}

/**
 * Valida formato de permissionKey: module.action
 */
export function isValidPermissionKey(key: string): boolean {
  return /^[a-z0-9_]+\.[a-z0-9_.]+$/.test(key);
}

/**
 * Detecta si un permiso es un wildcard (* o module.*)
 * @param permission Permiso a verificar (ej: "*", "keys.*", "users.read")
 * @returns true si es wildcard, false si es permiso exacto
 */
export function isWildcardPermission(permission: string): boolean {
  const normalized = normalizePermissionKey(permission);
  return normalized === '*' || /^[a-z0-9_]+\.\*$/.test(normalized);
}

/**
 * Valida si un permiso requerido coincide con los permisos permitidos (incluyendo wildcards)
 * @param requiredPermission Permiso requerido (ej: "keys.create")
 * @param allowedPermissions Set de permisos permitidos (ej: ["*"], ["keys.*"], ["keys.create"])
 * @returns true si el usuario tiene el permiso (exacto o vía wildcard)
 */
export function matchesWildcard(
  requiredPermission: string,
  allowedPermissions: Set<string>,
): boolean {
  const normalized = normalizePermissionKey(requiredPermission);

  // Caso 1: Tiene wildcard global *
  if (allowedPermissions.has('*')) {
    return true;
  }

  // Caso 2: Tiene el permiso exacto
  if (allowedPermissions.has(normalized)) {
    return true;
  }

  // Caso 3: Tiene wildcard de módulo (module.*)
  // Extraer módulo del permiso requerido (ej: "keys.create" → "keys")
  const [module] = normalized.split('.');
  if (module && allowedPermissions.has(`${module}.*`)) {
    return true;
  }

  return false;
}

/**
 * Categoriza un array de permisos en wildcards globales, wildcards de módulo y permisos exactos
 * @param permissions Array de permisos
 * @returns Objeto con categorización
 */
export function expandWildcards(permissions: string[]): {
  hasGlobalWildcard: boolean;
  moduleWildcards: Set<string>;
  exactPermissions: Set<string>;
} {
  const result = {
    hasGlobalWildcard: false,
    moduleWildcards: new Set<string>(),
    exactPermissions: new Set<string>(),
  };

  for (const perm of permissions) {
    const normalized = normalizePermissionKey(perm);

    if (normalized === '*') {
      result.hasGlobalWildcard = true;
    } else if (/^[a-z0-9_]+\.\*$/.test(normalized)) {
      result.moduleWildcards.add(normalized);
    } else {
      result.exactPermissions.add(normalized);
    }
  }

  return result;
}
