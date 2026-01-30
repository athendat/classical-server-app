import { MODULES, ACTIONS } from '../authz.constants';

/**
 * Catálogo inicial de permisos del sistema (isSystem=true).
 * Fuente de verdad para seeds.
 */
export const SYSTEM_PERMISSIONS = [
  // ===== USERS =====
  {
    key: `${MODULES.USERS}.${ACTIONS.CREATE}`,
    description: 'Crear usuarios',
    resource: MODULES.USERS,
    action: ACTIONS.CREATE,
  },
  {
    key: `${MODULES.USERS}.${ACTIONS.READ}`,
    description: 'Leer usuarios',
    resource: MODULES.USERS,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.USERS}.${ACTIONS.UPDATE}`,
    description: 'Actualizar usuarios',
    resource: MODULES.USERS,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.USERS}.${ACTIONS.DELETE}`,
    description: 'Eliminar usuarios',
    resource: MODULES.USERS,
    action: ACTIONS.DELETE,
  },
  {
    key: `${MODULES.USERS}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de usuarios',
    resource: MODULES.USERS,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.USERS}.${ACTIONS.ENABLE}`,
    description: 'Habilitar usuarios',
    resource: MODULES.USERS,
    action: ACTIONS.ENABLE,
  },
  {
    key: `${MODULES.USERS}.${ACTIONS.DISABLE}`,
    description: 'Deshabilitar usuarios',
    resource: MODULES.USERS,
    action: ACTIONS.DISABLE,
  },

  // ===== SERVICES =====
  {
    key: `${MODULES.SERVICES}.${ACTIONS.CREATE}`,
    description: 'Crear servicios',
    resource: MODULES.SERVICES,
    action: ACTIONS.CREATE,
  },
  {
    key: `${MODULES.SERVICES}.${ACTIONS.READ}`,
    description: 'Leer servicios',
    resource: MODULES.SERVICES,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.SERVICES}.${ACTIONS.UPDATE}`,
    description: 'Actualizar servicios',
    resource: MODULES.SERVICES,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.SERVICES}.${ACTIONS.DELETE}`,
    description: 'Eliminar servicios',
    resource: MODULES.SERVICES,
    action: ACTIONS.DELETE,
  },
  {
    key: `${MODULES.SERVICES}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de servicios',
    resource: MODULES.SERVICES,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.SERVICES}.${ACTIONS.ENABLE}`,
    description: 'Habilitar servicios',
    resource: MODULES.SERVICES,
    action: ACTIONS.ENABLE,
  },
  {
    key: `${MODULES.SERVICES}.${ACTIONS.DISABLE}`,
    description: 'Deshabilitar servicios',
    resource: MODULES.SERVICES,
    action: ACTIONS.DISABLE,
  },

  // ===== MODULES =====
  {
    key: `${MODULES.MODULES}.${ACTIONS.CREATE}`,
    description: 'Crear módulos',
    resource: MODULES.MODULES,
    action: ACTIONS.CREATE,
  },
  {
    key: `${MODULES.MODULES}.${ACTIONS.READ}`,
    description: 'Leer catálogo de módulos',
    resource: MODULES.MODULES,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.MODULES}.${ACTIONS.UPDATE}`,
    description: 'Actualizar configuración de módulos',
    resource: MODULES.MODULES,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.MODULES}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de módulos',
    resource: MODULES.MODULES,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.MODULES}.${ACTIONS.ENABLE}`,
    description: 'Habilitar módulos',
    resource: MODULES.MODULES,
    action: ACTIONS.ENABLE,
  },
  {
    key: `${MODULES.MODULES}.${ACTIONS.DISABLE}`,
    description: 'Deshabilitar módulos',
    resource: MODULES.MODULES,
    action: ACTIONS.DISABLE,
  },

  // ===== ROLES =====
  {
    key: `${MODULES.ROLES}.${ACTIONS.CREATE}`,
    description: 'Crear roles',
    resource: MODULES.ROLES,
    action: ACTIONS.CREATE,
  },
  {
    key: `${MODULES.ROLES}.${ACTIONS.READ}`,
    description: 'Leer roles',
    resource: MODULES.ROLES,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.ROLES}.${ACTIONS.UPDATE}`,
    description: 'Actualizar roles',
    resource: MODULES.ROLES,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.ROLES}.${ACTIONS.DELETE}`,
    description: 'Eliminar roles',
    resource: MODULES.ROLES,
    action: ACTIONS.DELETE,
  },
  {
    key: `${MODULES.ROLES}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de roles',
    resource: MODULES.ROLES,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.ROLES}.${ACTIONS.ENABLE}`,
    description: 'Habilitar roles',
    resource: MODULES.ROLES,
    action: ACTIONS.ENABLE,
  },
  {
    key: `${MODULES.ROLES}.${ACTIONS.DISABLE}`,
    description: 'Deshabilitar roles',
    resource: MODULES.ROLES,
    action: ACTIONS.DISABLE,
  },
  {
    key: `${MODULES.ROLES}.${ACTIONS.ASSIGN}`,
    description: 'Asignar roles a usuarios/servicios',
    resource: MODULES.ROLES,
    action: ACTIONS.ASSIGN,
  },

  // ===== PERMISSIONS =====
  {
    key: `${MODULES.PERMISSIONS}.${ACTIONS.CREATE}`,
    description: 'Crear permisos',
    resource: MODULES.PERMISSIONS,
    action: ACTIONS.CREATE,
  },
  {
    key: `${MODULES.PERMISSIONS}.${ACTIONS.READ}`,
    description: 'Leer permisos',
    resource: MODULES.PERMISSIONS,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.PERMISSIONS}.${ACTIONS.UPDATE}`,
    description: 'Actualizar permisos',
    resource: MODULES.PERMISSIONS,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.PERMISSIONS}.${ACTIONS.DELETE}`,
    description: 'Eliminar permisos',
    resource: MODULES.PERMISSIONS,
    action: ACTIONS.DELETE,
  },
  {
    key: `${MODULES.PERMISSIONS}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de permisos',
    resource: MODULES.PERMISSIONS,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.PERMISSIONS}.${ACTIONS.ENABLE}`,
    description: 'Habilitar permisos',
    resource: MODULES.PERMISSIONS,
    action: ACTIONS.ENABLE,
  },
  {
    key: `${MODULES.PERMISSIONS}.${ACTIONS.DISABLE}`,
    description: 'Deshabilitar permisos',
    resource: MODULES.PERMISSIONS,
    action: ACTIONS.DISABLE,
  },

  // ===== AUDIT =====
  {
    key: `${MODULES.AUDIT}.${ACTIONS.READ}`,
    description: 'Leer eventos de auditoría',
    resource: MODULES.AUDIT,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.AUDIT}.${ACTIONS.EXPORT}`,
    description: 'Exportar eventos de auditoría',
    resource: MODULES.AUDIT,
    action: ACTIONS.EXPORT,
  },

  // ===== TERMINAL =====
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.CREATE}`,
    description: 'Crear terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.CREATE,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.READ}`,
    description: 'Leer metadata de terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.UPDATE}`,
    description: 'Actualizar terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.DELETE}`,
    description: 'Eliminar terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.DELETE,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.ENROLL}`,
    description: 'Enrolar terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.ENROLL,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.INITIALIZE}`,
    description: 'Inicializar terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.INITIALIZE,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.ROTATE}`,
    description: 'Rotar llaves de terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.ROTATE,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.REVOKE}`,
    description: 'Revocar terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.REVOKE,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.ENABLE}`,
    description: 'Habilitar terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.ENABLE,
  },
  {
    key: `${MODULES.TERMINAL}.${ACTIONS.DISABLE}`,
    description: 'Deshabilitar terminales',
    resource: MODULES.TERMINAL,
    action: ACTIONS.DISABLE,
  },

  // ===== KEYS =====
  {
    key: `${MODULES.KEYS}.${ACTIONS.CREATE}`,
    description: 'Crear metadata de llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.CREATE,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.READ}`,
    description: 'Leer metadata de llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.UPDATE}`,
    description: 'Actualizar metadata de llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.DELETE}`,
    description: 'Eliminar metadata de llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.DELETE,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.ROTATE}`,
    description: 'Rotar llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.ROTATE,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.REVOKE}`,
    description: 'Revocar llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.REVOKE,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.ENABLE}`,
    description: 'Habilitar llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.ENABLE,
  },
  {
    key: `${MODULES.KEYS}.${ACTIONS.DISABLE}`,
    description: 'Deshabilitar llaves',
    resource: MODULES.KEYS,
    action: ACTIONS.DISABLE,
  },

  // ===== VAULT =====
  {
    key: `${MODULES.VAULT}.${ACTIONS.READ}`,
    description: 'Leer metadata/health de Vault',
    resource: MODULES.VAULT,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.VAULT}.${ACTIONS.UPDATE}`,
    description: 'Actualizar configuración no secreta de Vault',
    resource: MODULES.VAULT,
    action: ACTIONS.UPDATE,
  },
  {
    key: `${MODULES.VAULT}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de Vault',
    resource: MODULES.VAULT,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.VAULT}.${ACTIONS.ROTATE}`,
    description: 'Operaciones de rotación en Vault',
    resource: MODULES.VAULT,
    action: ACTIONS.ROTATE,
  },

  // ===== ISSUERS =====
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.READ}`,
    description: 'Leer metadata de emisores',
    resource: MODULES.ISSUERS,
    action: ACTIONS.READ,
  },
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.EXPORT}`,
    description: 'Exportar metadata de emisores',
    resource: MODULES.ISSUERS,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.ZPK_CREATE}`,
    description: 'Crear/registrar ZPK de emisor',
    resource: MODULES.ISSUERS,
    action: ACTIONS.ZPK_CREATE,
  },
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.ZPK_ROTATE}`,
    description: 'Rotar ZPK de emisor',
    resource: MODULES.ISSUERS,
    action: ACTIONS.ZPK_ROTATE,
  },
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.ZPK_REVOKE}`,
    description: 'Revocar ZPK de emisor',
    resource: MODULES.ISSUERS,
    action: ACTIONS.ZPK_REVOKE,
  },
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.ZPK_READ_METADATA}`,
    description: 'Leer metadata de ZPK',
    resource: MODULES.ISSUERS,
    action: ACTIONS.ZPK_READ_METADATA,
  },
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.TRANSFORM_PINBLOCK}`,
    description: 'Autorizar transformación de PIN-block',
    resource: MODULES.ISSUERS,
    action: ACTIONS.TRANSFORM_PINBLOCK,
  },
  {
    key: `${MODULES.ISSUERS}.${ACTIONS.EXPORT_METADATA}`,
    description: 'Exportar metadata de operaciones (sin payloads)',
    resource: MODULES.ISSUERS,
    action: ACTIONS.EXPORT_METADATA,
  },

  // ===== EXTERNAL_SERVICE =====
  {
    key: `${MODULES.EXTERNAL_SERVICE}.${ACTIONS.INVOKE}`,
    description: 'Invocar servicio externo',
    resource: MODULES.EXTERNAL_SERVICE,
    action: ACTIONS.INVOKE,
  },
  {
    key: `${MODULES.EXTERNAL_SERVICE}.${ACTIONS.READ_STATUS}`,
    description: 'Leer estado del servicio externo',
    resource: MODULES.EXTERNAL_SERVICE,
    action: ACTIONS.READ_STATUS,
  },
  {
    key: `${MODULES.EXTERNAL_SERVICE}.${ACTIONS.EXPORT}`,
    description: 'Exportar health/latencias/errores agregados',
    resource: MODULES.EXTERNAL_SERVICE,
    action: ACTIONS.EXPORT,
  },
  {
    key: `${MODULES.EXTERNAL_SERVICE}.${ACTIONS.ROTATE_INTEGRATION}`,
    description: 'Rotar credenciales de integración',
    resource: MODULES.EXTERNAL_SERVICE,
    action: ACTIONS.ROTATE_INTEGRATION,
  },
];
