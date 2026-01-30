import { MODULES, ACTIONS } from '../authz.constants';

/**
 * Roles del sistema (isSystem=true, inmutables).
 * Nuevas estructuras:
 * - super_admin: wildcard global "*" - solo para Super Administrator
 * - admin: wildcard global "*" - acceso total al sistema
 * - Otros roles: wildcards por módulo "module.*" + permisos exactos
 */

export const SYSTEM_ROLES = [
  /**
   * Super Administrator - Acceso irrestricto a todo
   * Solo para el usuario SA inicial que se crea vía bootstrap
   * Cualquier permiso con requiresSuperAdmin=true REQUIERE este rol específicamente
   */
  {
    key: 'super_admin',
    name: 'Super Administrador',
    description:
      'Superusuario con acceso ilimitado a todas las operaciones. Wildcard global: *',
    permissionKeys: ['*'],
    status: 'active',
    isSystem: true,
  },

  /**
   * Admin - Acceso completo a todos los módulos
   * Similar a super_admin pero NO tiene permiso para operaciones marcadas con requiresSuperAdmin=true
   */
  {
    key: 'admin',
    name: 'Administrador',
    description:
      'Administrador del sistema con acceso a todos los módulos y operaciones estándar',
    permissionKeys: ['*'],
    status: 'active',
    isSystem: true,
  },

  /**
   * Security Officer - Gestión de seguridad, roles, permisos, rotación de llaves
   * Acceso completo a: roles, permisos, vault, keys, terminals, issuers
   */
  {
    key: 'security_officer',
    name: 'Oficial de Seguridad',
    description: 'Gestión de roles, permisos, rotación y revocación de llaves',
    permissionKeys: [
      // Módulos públicos (solo lectura)
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
      // Dashboard
      `${MODULES.DASHBOARD}.read`,
      // Acceso completo a módulos de seguridad
      `${MODULES.ROLES}.*`,
      `${MODULES.PERMISSIONS}.*`,
      `${MODULES.VAULT}.*`,
      `${MODULES.KEYS}.*`,
      `${MODULES.TERMINAL}.*`,
      // Issuers (acceso completo)
      `${MODULES.ISSUERS}.*`,
      // Auditoría
      `${MODULES.AUDIT}.read`,
      `${MODULES.AUDIT}.export`,
      // External Service
      `${MODULES.EXTERNAL_SERVICE}.read_status`,
      `${MODULES.EXTERNAL_SERVICE}.export`,
      `${MODULES.EXTERNAL_SERVICE}.rotate_integration`,
    ],
    status: 'active',
    isSystem: true,
  },

  /**
   * Operator - Operaciones cotidianas de terminales
   * Permisos específicos limitados a operaciones no-críticas
   * En issuers: solo CRUD, NO zpk operations
   */
  {
    key: 'ops',
    name: 'Operador',
    description: 'Operaciones cotidianas de terminales y consultas',
    permissionKeys: [
      // Módulos públicos (solo lectura)
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
      // Dashboard
      `${MODULES.DASHBOARD}.read`,
      // Terminales
      `${MODULES.TERMINAL}.create`,
      `${MODULES.TERMINAL}.read`,
      `${MODULES.TERMINAL}.update`,
      `${MODULES.TERMINAL}.export`,
      `${MODULES.TERMINAL}.enroll`,
      `${MODULES.TERMINAL}.initialize`,
      `${MODULES.TERMINAL}.enable`,
      `${MODULES.TERMINAL}.disable`,
      // Keys (solo lectura)
      `${MODULES.KEYS}.read`,
      `${MODULES.KEYS}.export`,
      // Issuers (solo CRUD, NO zpk operations)
      `${MODULES.ISSUERS}.view`,
      `${MODULES.ISSUERS}.create`,
      `${MODULES.ISSUERS}.edit`,
      `${MODULES.ISSUERS}.delete`,
      // External Service
      `${MODULES.EXTERNAL_SERVICE}.invoke`,
      `${MODULES.EXTERNAL_SERVICE}.read_status`,
      // Audit
      `${MODULES.AUDIT}.read`,
    ],
    status: 'active',
    isSystem: true,
  },

  /**
   * Auditor - Lectura y exportación únicamente
   * Sin acceso a operaciones destructivas o mutantes
   */
  {
    key: 'auditor',
    name: 'Auditor',
    description: 'Solo lectura y exportación de auditoría, metadata y recursos',
    permissionKeys: [
      // Módulos públicos (solo lectura)
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
      // Dashboard
      `${MODULES.DASHBOARD}.read`,
      // Lectura de auditoría
      `${MODULES.AUDIT}.read`,
      `${MODULES.AUDIT}.export`,
      // Lectura de recursos
      `${MODULES.TERMINAL}.read`,
      `${MODULES.TERMINAL}.export`,
      `${MODULES.KEYS}.read`,
      `${MODULES.KEYS}.export`,
      `${MODULES.ISSUERS}.view`,
      `${MODULES.ISSUERS}.zpk-metadata`,
      `${MODULES.USERS}.read`,
      `${MODULES.USERS}.export`,
      `${MODULES.SERVICES}.read`,
      `${MODULES.SERVICES}.export`,
      `${MODULES.ROLES}.read`,
      `${MODULES.ROLES}.export`,
      `${MODULES.PERMISSIONS}.read`,
      `${MODULES.PERMISSIONS}.export`,
      `${MODULES.MODULES}.read`,
      `${MODULES.MODULES}.export`,
      `${MODULES.VAULT}.read`,
      `${MODULES.VAULT}.export`,
      `${MODULES.EXTERNAL_SERVICE}.read_status`,
      `${MODULES.EXTERNAL_SERVICE}.export`,
    ],
    status: 'active',
    isSystem: true,
  },
];
