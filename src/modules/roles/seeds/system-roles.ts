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
   * Acceso completo a: roles, permisos, vault, keys, tenants, cards, transactions
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
      // `${MODULES.MERCHANTS}.read`,
      `${MODULES.CARDS}.read`,
      `${MODULES.USERS}.read`,
      `${MODULES.TRANSACTIONS}.read`,
      `${MODULES.TERMINALS}.read`,
      `${MODULES.VAULT}.read`,
      `${MODULES.KEYS}.read`,
      `${MODULES.AUDIT}.read`,

      // Acceso completo a módulos de seguridad
      `${MODULES.ROLES}.*`,
      `${MODULES.PERMISSIONS}.*`,

      // Tenants - Acceso completo para gestión de seguridad
      `${MODULES.TENANTS}.*`,

      // Auditoría
      `${MODULES.AUDIT}.export`,

      // External Service
      `${MODULES.EXTERNAL_SERVICE}.export`,
      `${MODULES.EXTERNAL_SERVICE}.rotate`,
    ],
    status: 'active',
    isSystem: true,
  },

  /**
   * Operator - Operaciones cotidianas de la plataforma
   * Permisos específicos limitados a operaciones no-críticas
   * En issuers: solo CRUD, NO zpk operations
   */
  {
    key: 'ops',
    name: 'Operador',
    description: 'Operaciones cotidianas de la plataforma y consultas',
    permissionKeys: [
      // Módulos públicos (solo lectura)
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,

      // Dashboard
      `${MODULES.DASHBOARD}.read`,

      // Terminals
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TERMINALS}.create`,
      `${MODULES.TERMINALS}.update`,
      `${MODULES.TERMINALS}.disable`,
      `${MODULES.TERMINALS}.enable`,

      // Transactions
      `${MODULES.TRANSACTIONS}.create`,
      `${MODULES.TRANSACTIONS}.read`,
      `${MODULES.TRANSACTIONS}.update`,
      `${MODULES.TRANSACTIONS}.export`,

      // Cards
      `${MODULES.CARDS}.read`,

      // Tenants
      `${MODULES.TENANTS}.read`,
      `${MODULES.TENANTS}.create`,
      `${MODULES.TENANTS}.update`,

      // External Service
      `${MODULES.EXTERNAL_SERVICE}.export`,
      `${MODULES.EXTERNAL_SERVICE}.rotate`,
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
      `${MODULES.KEYS}.read`,
      `${MODULES.KEYS}.export`,
      `${MODULES.USERS}.read`,
      `${MODULES.USERS}.export`,
      // `${MODULES.MERCHANTS}.read`,
      // `${MODULES.MERCHANTS}.export`,
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TERMINALS}.export`,
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
      `${MODULES.EXTERNAL_SERVICE}.export`,
      `${MODULES.EXTERNAL_SERVICE}.rotate`,
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

      // Mi Negocio (propio tenant)
      `${MODULES.MY_TENANT}.read`,
      `${MODULES.MY_TENANT}.update`,

      // Perfil de usuario (propio)
      `${MODULES.USERS}.read`,
      `${MODULES.USERS}.update`,

      // Gestión de tarjetas personales
      `${MODULES.CARDS}.create`,
      `${MODULES.CARDS}.read`,
      `${MODULES.CARDS}.update`,
      `${MODULES.CARDS}.delete`,

      // Terminales propias del tenant
      `${MODULES.TERMINALS}.create`,
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TERMINALS}.update`,
      `${MODULES.TERMINALS}.delete`,
      `${MODULES.TERMINALS}.enable`,
      `${MODULES.TERMINALS}.disable`,

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
   * Permisos para gestionar su propia información, crear usuarios y ver transacciones de su negocio
   */
  {
    key: 'merchant',
    name: 'Comerciante',
    description:
      'Rol base para comerciantes con permisos para gestionar su propia información, crear usuarios y ver transacciones de su negocio',
    permissionKeys: [
      // Public / help
      `${MODULES.CHANGELOG}.read`,
      // TODO: uncomment when DOCUMENTATION and SUPPORT modules are defined
      // `${MODULES.DOCUMENTATION}.read`,
      // `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
      `${MODULES.DASHBOARD}.read`,

      // Mi Negocio (gestión del propio tenant)
      `${MODULES.MY_TENANT}.read`,
      `${MODULES.MY_TENANT}.update`,

      // Gestión del comercio (propio)
      // `${MODULES.MERCHANTS}.view`,

      // Usuarios del comercio
      `${MODULES.USERS}.view`,

      // Terminales del comercio
      `${MODULES.TERMINALS}.create`,
      `${MODULES.TERMINALS}.read`,
      `${MODULES.TERMINALS}.update`,
      `${MODULES.TERMINALS}.delete`,
      `${MODULES.TERMINALS}.enable`,
      `${MODULES.TERMINALS}.disable`,

      // Transacciones del comercio
      `${MODULES.TRANSACTIONS}.create`,
      `${MODULES.TRANSACTIONS}.view`,
      `${MODULES.TRANSACTIONS}.export`,

      // Api Credentials (propio del comercio)
      `${MODULES.API_CREDENTIALS}.read`,
      `${MODULES.API_CREDENTIALS}.update`,
    ],
    status: 'active',
    isSystem: true,
  },

  /**
   * Developer - Rol para programadores externos/internos
   * Acceso a: API Credentials (read), Transactions (read)
   */
  {
    key: 'developer',
    name: 'Desarrollador',
    description:
      'Rol para programadores que necesitan integrarse, con acceso a credenciales de API y consulta de transacciones.',
    permissionKeys: [
      // API Credentials (propio del usuario/tenant)
      `${MODULES.API_CREDENTIALS}.read`,

      // Transactions
      `${MODULES.TRANSACTIONS}.read`,

      // Dashboard
      `${MODULES.DASHBOARD}.read`,

      // Módulos públicos / Ayuda
      `${MODULES.CHANGELOG}.read`,
      `${MODULES.DOCUMENTATION}.read`,
      `${MODULES.SUPPORT}.read`,
      `${MODULES.CONTACT}.read`,
    ],
    status: 'active',
    isSystem: true,
  },
];
