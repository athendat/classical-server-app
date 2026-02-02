import { MODULES } from 'src/modules/modules/domain/constants/module.constants';

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
      // Módulos de solo lectura
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
      `${MODULES.DASHBOARD}.read`,
      `${MODULES.MERCHANTS}.read`,
      `${MODULES.CARDS}.read`,
      `${MODULES.USERS}.read`,
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TRANSACTIONS}.read`,
      `${MODULES.VAULT}.read`,
      `${MODULES.KEYS}.read`,
      `${MODULES.AUDIT}.read`,

      // Acceso completo a módulos de seguridad
      `${MODULES.ROLES}.*`,
      `${MODULES.PERMISSIONS}.*`,

      // Tenants - View sensitive data
      `${MODULES.TENANTS}.read`,
      `${MODULES.TENANTS}.view-sensitive`,

      // Auditoría
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
      `${MODULES.TERMINALS}.create`,
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TERMINALS}.update`,
      `${MODULES.TERMINALS}.export`,
      `${MODULES.TERMINALS}.enable`,
      `${MODULES.TERMINALS}.disable`,

      // Merchants (solo CRUD)
      `${MODULES.MERCHANTS}.view`,
      `${MODULES.MERCHANTS}.create`,
      `${MODULES.MERCHANTS}.edit`,
      `${MODULES.MERCHANTS}.delete`,

      // Users
      `${MODULES.MERCHANTS}.view`,
      `${MODULES.MERCHANTS}.edit`,

      // Cards
      `${MODULES.CARDS}.read`,

      // Transactions
      `${MODULES.TRANSACTIONS}.read`,
      `${MODULES.TRANSACTIONS}.export`,

      // Tenants
      `${MODULES.TENANTS}.read`,
      `${MODULES.TENANTS}.create`,
      `${MODULES.TENANTS}.write`,
      `${MODULES.TENANTS}.approve`,

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
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TERMINALS}.export`,
      `${MODULES.KEYS}.read`,
      `${MODULES.KEYS}.export`,
      `${MODULES.USERS}.read`,
      `${MODULES.USERS}.export`,
      `${MODULES.MERCHANTS}.read`,
      `${MODULES.MERCHANTS}.export`,
      `${MODULES.TRANSACTIONS}.read`,
      `${MODULES.TRANSACTIONS}.export`,
      `${MODULES.CARDS}.read`,
      `${MODULES.CARDS}.export`,
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
      // Tenants
      `${MODULES.TENANTS}.read`,
      `${MODULES.TENANTS}.view-sensitive`,
      `${MODULES.EXTERNAL_SERVICE}.read_status`,
      `${MODULES.EXTERNAL_SERVICE}.export`,
    ],
    status: 'active',
    isSystem: true,
  },

  /**
   * User - Rol base para usuarios normales sin privilegios especiales
   * Permisos para registrar sus tarjetas y realizar transacciones
   */
  {
    key: 'user',
    name: 'Usuario',
    description: 'Rol base para usuarios normales sin privilegios especiales',
    permissionKeys: [
      // Public / help
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
      `${MODULES.DASHBOARD}.read`,

      // Perfil de usuario (propio)
      `${MODULES.USERS}.read`,
      `${MODULES.USERS}.update`,

      // Gestión de tarjetas personales
      `${MODULES.CARDS}.create`,
      `${MODULES.CARDS}.read`,
      `${MODULES.CARDS}.update`,
      `${MODULES.CARDS}.delete`,

      // Transacciones (iniciar y consultar propias)
      `${MODULES.TRANSACTIONS}.create`,
      `${MODULES.TRANSACTIONS}.read`,
      `${MODULES.TRANSACTIONS}.export`,

      // Invocar servicios externos (pago, verificación)
      `${MODULES.EXTERNAL_SERVICE}.invoke`,
      `${MODULES.EXTERNAL_SERVICE}.read_status`,
    ],
    status: 'active',
    isSystem: true,
  },

  /**
   * Merchant - Rol base para comerciantes
   * Permisos para gestionar su propia información, crear terminales y ver transacciones de su negocio
   */
  {
    key: 'merchant',
    name: 'Comerciante',
    description:
      'Rol base para comerciantes con permisos para gestionar su propia información, crear terminales y ver transacciones de su negocio',
    permissionKeys: [
      // Public / help
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
      `${MODULES.DASHBOARD}.read`,

      // Gestión del comercio (propio)
      `${MODULES.MERCHANTS}.create`,
      `${MODULES.MERCHANTS}.read`,
      `${MODULES.MERCHANTS}.edit`,
      `${MODULES.MERCHANTS}.delete`,

      // Terminales del comercio
      `${MODULES.TERMINALS}.create`,
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TERMINALS}.update`,
      `${MODULES.TERMINALS}.export`,
      `${MODULES.TERMINALS}.enable`,
      `${MODULES.TERMINALS}.disable`,

      // Usuarios del comercio
      `${MODULES.USERS}.create`,
      `${MODULES.USERS}.read`,
      `${MODULES.USERS}.edit`,
      `${MODULES.USERS}.delete`,

      // Transacciones del comercio
      `${MODULES.TRANSACTIONS}.read`,
      `${MODULES.TRANSACTIONS}.export`,
      `${MODULES.TRANSACTIONS}.create`,

      // Cartas / clientes
      `${MODULES.CARDS}.read`,

      // Integraciones externas necesarias
      `${MODULES.EXTERNAL_SERVICE}.invoke`,
      `${MODULES.EXTERNAL_SERVICE}.read_status`,
    ],
    status: 'active',
    isSystem: true,
  },
];
