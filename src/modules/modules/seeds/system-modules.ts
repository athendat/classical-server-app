import { ModuleType } from '../domain';
import { ModuleEntity, Permission } from '../domain/module.entity';

/**
 * Catálogo semilla de módulos del sistema
 * SOURCE OF TRUTH: Esta es la definición canónica de los módulos de la plataforma
 *
 * Todos estos módulos son inmutables (isSystem: true) y se crean durante el seeding
 * Los permisos están pre-generados con estructura completa
 */

/**
 * Helper para generar un permiso
 */
function createPermission(
  id: string,
  name: string,
  indicator: string,
  description: string,
  enabled: boolean = true,
  requiresSuperAdmin: boolean = false,
): Permission {
  return {
    id,
    name,
    indicator,
    description,
    enabled,
    requiresSuperAdmin,
  };
}

/**
 * Helper para generar múltiples permisos a partir de acciones
 */
function createPermissionsFromActions(
  moduleIndicator: string,
  moduleName: string,
  actions: {
    action: string;
    id: string;
    name: string;
    description: string;
    enabled?: boolean;
    requiresSuperAdmin?: boolean;
  }[],
): Permission[] {
  return actions.map((a) =>
    createPermission(
      a.id,
      a.name,
      `${moduleIndicator}.${a.action}`,
      a.description,
      a.enabled ?? true,
      a.requiresSuperAdmin ?? false,
    ),
  );
}

// ============================================================================
// MÓDULOS PÚBLICOS (Sin autenticación / Solo lectura)
// ============================================================================

// ============================================================================
// MÓDULO INICIAL (Dashboard)
// ============================================================================

const DASHBOARD_MODULE = new ModuleEntity({
  indicator: 'dashboard',
  name: 'Dashboard',
  description: 'Panel de inicio con métricas y vista general del sistema.',
  icon: 'dashboard',
  actions: ['read'],
  permissions: createPermissionsFromActions('dashboard', 'Dashboard', [
    {
      action: 'read',
      id: 'db_r',
      name: 'Ver Dashboard',
      description:
        'Acceso al panel de control con métricas y resumen del sistema.',
      enabled: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

// ============================================================================
// MÓDULO DE NEGOCIO PERSONAL (My Tenant)
// ============================================================================

const MY_TENANT_MODULE = new ModuleEntity({
  order: 1,
  indicator: 'my-tenant',
  name: 'My Tenant',
  description:
    'Gestión de datos del propio negocio/organización (tenant) del usuario autenticado.',
  icon: 'store',
  actions: ['read', 'update'],
  permissions: createPermissionsFromActions('my-tenant', 'My Tenant', [
    {
      action: 'read',
      id: 'mt_r',
      name: 'Ver Mi Negocio',
      description: 'Visualizar información del propio negocio y perfil.',
      enabled: true,
    },
    {
      action: 'update',
      id: 'mt_u',
      name: 'Actualizar Mi Negocio',
      description:
        'Modificar información básica del propio negocio (nombre, contacto, etc).',
      enabled: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

// ============================================================================
// MÓDULOS DE NEGOCIO
// ============================================================================

const MANAGEMENT_MODULE = new ModuleEntity({
  order: 2,
  indicator: 'management',
  name: 'Management',
  description:
    'Módulo grupo para gestión de transacciones, comercios y terminales.',
  status: 'active',
  isSystem: true,
  type: ModuleType.group,
});

const TERMINALS_MODULE = new ModuleEntity({
  order: 0,
  parent: 'management',
  indicator: 'terminals',
  name: 'Terminals',
  description:
    'Gestión de aplicaciones clientes, credenciales OAuth y configuración de webhooks.',
  icon: 'point_of_sale',
  actions: ['view', 'create', 'manage-secrets', 'webhooks', 'logs'],
  permissions: createPermissionsFromActions('terminals', 'Terminals', [
    {
      action: 'view',
      id: 'tm_v',
      name: 'Ver Terminales',
      description: 'Visualizar las aplicaciones registradas en el hub.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'tm_c',
      name: 'Registrar Terminal',
      description: 'Dar de alta nuevas aplicaciones o dispositivos.',
      enabled: false,
    },
    {
      action: 'manage-secrets',
      id: 'tm_s',
      name: 'Rotar Secretos',
      description: 'Generar nuevos Client Secrets y revocar los antiguos.',
      enabled: false,
    },
    {
      action: 'webhooks',
      id: 'tm_w',
      name: 'Gestionar Webhooks',
      description: 'Configurar la URL y eventos de notificación del terminal.',
      enabled: true,
    },
    {
      action: 'logs',
      id: 'tm_l',
      name: 'Ver Logs Técnicos',
      description: 'Acceso a los logs de conexión específicos del terminal.',
      enabled: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const MERCHANTS_MODULE = new ModuleEntity({
  order: 1,
  parent: 'management',
  indicator: 'merchants',
  name: 'Merchants',
  description: 'Gestión de comercios y sus datos.',
  icon: 'business',
  actions: ['view', 'create', 'edit', 'delete'],
  permissions: createPermissionsFromActions('merchants', 'Merchants', [
    {
      action: 'view',
      id: 'is_v',
      name: 'Ver comercios',
      description: 'Listar y visualizar detalles de comercios.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'is_c',
      name: 'Crear comercios',
      description: 'Registrar nuevos comercios en el sistema.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'edit',
      id: 'is_e',
      name: 'Editar comercios',
      description: 'Modificar información de comercios existentes.',
      enabled: false,
    },
    {
      action: 'delete',
      id: 'is_d',
      name: 'Eliminar comercios',
      description: 'Dar de baja comercios del sistema.',
      enabled: false,
      requiresSuperAdmin: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const KEYS_MODULE = new ModuleEntity({
  order: 3,
  parent: 'management',
  indicator: 'keys',
  name: 'Keys',
  description: 'Gestión de claves criptográficas.',
  icon: 'vpn_key',
  actions: ['view', 'create', 'rotate', 'revoke', 'export'],
  permissions: createPermissionsFromActions('keys', 'Keys', [
    {
      action: 'view',
      id: 'k_v',
      name: 'Ver Claves',
      description: 'Visualizar claves criptográficas y su estado.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'k_c',
      name: 'Crear Claves',
      description: 'Generar nuevas claves maestras o derivadas.',
      enabled: false,
    },
    {
      action: 'rotate',
      id: 'k_r',
      name: 'Rotar Claves',
      description: 'Renovar claves por expiración o cambio de política.',
      enabled: false,
    },
    {
      action: 'revoke',
      id: 'k_rv',
      name: 'Revocar Claves',
      description: 'Invalidar claves comprometidas.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'export',
      id: 'k_e',
      name: 'Exportar Claves',
      description: 'Descargar claves en formato encriptado.',
      enabled: false,
      requiresSuperAdmin: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

// ============================================================================
// MÓDULOS DEL SISTEMA KMS
// ============================================================================
const SYSTEM_MODULE = new ModuleEntity({
  order: 3,
  indicator: 'system',
  name: 'System',
  description:
    'Módulo grupo para administración del sistema y configuración de la plataforma.',
  status: 'active',
  isSystem: true,
  type: ModuleType.group,
});

const ANALYTICS_MODULE = new ModuleEntity({
  order: 0,
  parent: 'system',
  indicator: 'analytics',
  name: 'Analytics',
  description:
    'Métricas de rendimiento, volumen transaccional y tasas de conversión.',
  icon: 'monitoring',
  actions: ['view'],
  permissions: createPermissionsFromActions('analytics', 'Analytics', [
    {
      action: 'view',
      id: 'an_v',
      name: 'Ver Analíticas',
      description: 'Acceso a dashboards de rendimiento financiero.',
      enabled: false,
      requiresSuperAdmin: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const AUDIT_MODULE = new ModuleEntity({
  order: 1,
  parent: 'system',
  indicator: 'audit',
  name: 'Audit',
  description:
    'Registro de actividad y trazabilidad de cambios en la plataforma.',
  icon: 'policy',
  actions: ['view', 'export'],
  permissions: createPermissionsFromActions('audit', 'Audit', [
    {
      action: 'view',
      id: 'au_v',
      name: 'Consultar Logs',
      description: 'Ver quién hizo qué y cuándo en la plataforma.',
      enabled: true,
    },
    {
      action: 'export',
      id: 'au_e',
      name: 'Exportar Auditoría',
      description: 'Generar reportes de cumplimiento (compliance).',
      enabled: false,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const MODULES_MODULE = new ModuleEntity({
  order: 2,
  parent: 'system',
  indicator: 'modules',
  name: 'Modules',
  description: 'Gestión del catálogo de módulos de la plataforma.',
  icon: 'dashboard',
  actions: ['view', 'create', 'update', 'disable'],
  permissions: createPermissionsFromActions('modules', 'Modules', [
    {
      action: 'view',
      id: 'mod_v',
      name: 'Ver Módulos',
      description: 'Listar y visualizar módulos disponibles.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'mod_c',
      name: 'Crear Módulos',
      description: 'Registrar nuevos módulos en el sistema.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'update',
      id: 'mod_u',
      name: 'Actualizar Módulos',
      description: 'Modificar configuración de módulos existentes.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'disable',
      id: 'mod_d',
      name: 'Deshabilitar Módulos',
      description: 'Desactivar módulos temporalmente.',
      enabled: false,
      requiresSuperAdmin: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const ROLES_MODULE = new ModuleEntity({
  order: 3,
  parent: 'system',
  indicator: 'roles',
  name: 'Roles',
  description:
    'Definición y gestión de roles de acceso y sus permisos asociados.',
  icon: 'admin_panel_settings',
  actions: ['view', 'create', 'edit', 'delete'],
  permissions: createPermissionsFromActions('roles', 'Roles', [
    {
      action: 'view',
      id: 'r_v',
      name: 'Ver Roles',
      description: 'Listar y visualizar detalles de roles.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'r_c',
      name: 'Crear Roles',
      description: 'Definir nuevos roles personalizados.',
      enabled: false,
    },
    {
      action: 'edit',
      id: 'r_e',
      name: 'Editar Roles',
      description: 'Modificar permisos de roles existentes.',
      enabled: false,
    },
    {
      action: 'delete',
      id: 'r_d',
      name: 'Eliminar Roles',
      description: 'Remover roles del sistema.',
      enabled: false,
      requiresSuperAdmin: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const USERS_MODULE = new ModuleEntity({
  order: 4,
  parent: 'system',
  indicator: 'users',
  name: 'Users',
  description: 'Gestión de usuarios y asignación de roles y permisos.',
  icon: 'person',
  actions: ['view', 'create', 'edit', 'delete', 'assign-roles'],
  permissions: createPermissionsFromActions('users', 'Users', [
    {
      action: 'view',
      id: 'u_v',
      name: 'Ver Usuarios',
      description: 'Listar y visualizar detalles de usuarios.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'u_c',
      name: 'Crear Usuarios',
      description: 'Registrar nuevos usuarios en el sistema.',
      enabled: false,
    },
    {
      action: 'edit',
      id: 'u_e',
      name: 'Editar Usuarios',
      description: 'Modificar información de usuarios existentes.',
      enabled: false,
    },
    {
      action: 'delete',
      id: 'u_d',
      name: 'Eliminar Usuarios',
      description: 'Dar de baja usuarios del sistema.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'assign-roles',
      id: 'u_ar',
      name: 'Asignar Roles',
      description: 'Otorgar y revocar roles a usuarios.',
      enabled: false,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const CHANGELOG_MODULE = new ModuleEntity({
  order: 5,
  parent: 'system',
  indicator: 'changelog',
  name: 'Changelog',
  description: 'Registro de cambios y actualizaciones del sistema.',
  icon: 'history',
  actions: ['read'],
  permissions: createPermissionsFromActions('changelog', 'Changelog', [
    {
      action: 'read',
      id: 'ch_r',
      name: 'Leer Changelog',
      description: 'Ver el historial de cambios y versiones del sistema.',
      enabled: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const CONTACT_MODULE = new ModuleEntity({
  order: 6,
  parent: 'system',
  indicator: 'contact',
  name: 'Contact',
  description: 'Información de contacto y formulario de comunicación.',
  icon: 'mail',
  actions: ['read'],
  permissions: createPermissionsFromActions('contact', 'Contact', [
    {
      action: 'read',
      id: 'ct_r',
      name: 'Ver Contacto',
      description:
        'Acceso a información de contacto y formularios de comunicación.',
      enabled: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

// ============================================================================
// MÓDULOS DE NEGOCIO: Transacciones, Tarjetas, Tenants
// ============================================================================

const TRANSACTIONS_MODULE = new ModuleEntity({
  order: 2,
  parent: 'management',
  indicator: 'transactions',
  name: 'Transactions',
  description: 'Gestión y seguimiento de transacciones de pago.',
  icon: 'receipt_long',
  actions: ['view', 'create', 'edit', 'delete', 'export'],
  permissions: createPermissionsFromActions('transactions', 'Transactions', [
    {
      action: 'view',
      id: 'tx_v',
      name: 'Ver Transacciones',
      description: 'Listar y visualizar detalles de transacciones.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'tx_c',
      name: 'Crear Transacciones',
      description: 'Iniciar nuevas transacciones de pago.',
      enabled: true,
    },
    {
      action: 'edit',
      id: 'tx_e',
      name: 'Editar Transacciones',
      description: 'Modificar metadatos de transacciones existentes.',
      enabled: false,
    },
    {
      action: 'delete',
      id: 'tx_d',
      name: 'Eliminar Transacciones',
      description: 'Remover transacciones del sistema.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'export',
      id: 'tx_e',
      name: 'Exportar Transacciones',
      description: 'Descargar reporte de transacciones.',
      enabled: true,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const CARDS_MODULE = new ModuleEntity({
  order: 3,
  parent: 'management',
  indicator: 'cards',
  name: 'Cards',
  description: 'Gestión de tarjetas de pago y datos de pago.',
  icon: 'credit_card',
  actions: ['view', 'create', 'edit', 'delete', 'export'],
  permissions: createPermissionsFromActions('cards', 'Cards', [
    {
      action: 'view',
      id: 'cd_v',
      name: 'Ver Tarjetas',
      description: 'Listar y visualizar detalles de tarjetas (enmascaradas).',
      enabled: true,
    },
    {
      action: 'create',
      id: 'cd_c',
      name: 'Registrar Tarjetas',
      description: 'Registrar nuevas tarjetas de pago.',
      enabled: true,
    },
    {
      action: 'edit',
      id: 'cd_e',
      name: 'Editar Tarjetas',
      description: 'Actualizar información de tarjeta (alias, estado).',
      enabled: true,
    },
    {
      action: 'delete',
      id: 'cd_d',
      name: 'Eliminar Tarjetas',
      description: 'Remover tarjetas del sistema.',
      enabled: true,
    },
    {
      action: 'export',
      id: 'cd_e',
      name: 'Exportar Tarjetas',
      description: 'Descargar reporte de tarjetas registradas.',
      enabled: false,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

const TENANTS_MODULE = new ModuleEntity({
  order: 7,
  parent: 'system',
  indicator: 'tenants',
  name: 'Tenants',
  description:
    'Gestión de múltiples tenientes (clientes/organizaciones) en plataforma multi-tenant.',
  icon: 'apartment',
  actions: ['view', 'create', 'edit', 'delete', 'enable', 'disable'],
  permissions: createPermissionsFromActions('tenants', 'Tenants', [
    {
      action: 'view',
      id: 'tn_v',
      name: 'Ver Tenants',
      description: 'Listar y visualizar información de tenientes.',
      enabled: true,
    },
    {
      action: 'create',
      id: 'tn_c',
      name: 'Crear Tenants',
      description: 'Registrar nuevos tenientes en la plataforma.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'edit',
      id: 'tn_e',
      name: 'Editar Tenants',
      description: 'Modificar información de tenientes existentes.',
      enabled: false,
    },
    {
      action: 'delete',
      id: 'tn_d',
      name: 'Eliminar Tenants',
      description: 'Remover tenientes del sistema.',
      enabled: false,
      requiresSuperAdmin: true,
    },
    {
      action: 'enable',
      id: 'tn_en',
      name: 'Habilitar Tenants',
      description: 'Reactivar tenientes deshabilitados.',
      enabled: false,
    },
    {
      action: 'disable',
      id: 'tn_dis',
      name: 'Deshabilitar Tenants',
      description: 'Desactivar acceso de un teniente.',
      enabled: false,
    },
  ]),
  status: 'active',
  isSystem: true,
  type: ModuleType.basic,
});

// ============================================================================
// EXPORTAR CATÁLOGO
// ============================================================================

/**
 * Catálogo completo de módulos del sistema
 * SOURCE OF TRUTH para la estructura de módulos y permisos
 */
export const SYSTEM_MODULES: ModuleEntity[] = [
  // Módulo inicial (Dashboard)
  DASHBOARD_MODULE,

  // Módulo personal de tenant
  MY_TENANT_MODULE,

  // Módulos de negocio
  MANAGEMENT_MODULE,
  TERMINALS_MODULE,
  MERCHANTS_MODULE,
  KEYS_MODULE,
  TRANSACTIONS_MODULE,
  CARDS_MODULE,

  // Módulos de administración
  SYSTEM_MODULE,
  CHANGELOG_MODULE,
  ANALYTICS_MODULE,
  AUDIT_MODULE,
  CONTACT_MODULE,
  MODULES_MODULE,
  ROLES_MODULE,
  USERS_MODULE,
  TENANTS_MODULE,
  // DOCUMENTATION_MODULE,
  // PERMISSIONS_MODULE,
  // SUPPORT_MODULE,
  // VAULT_MODULE,
];

/**
 * Función helper para obtener un módulo por indicador
 */
export function getSystemModuleByIndicator(
  indicator: string,
): ModuleEntity | undefined {
  return SYSTEM_MODULES.find((m) => m.indicator === indicator.toLowerCase());
}

/**
 * Función helper para obtener todos los indicadores de módulos
 */
export function getSystemModuleIndicators(): string[] {
  return SYSTEM_MODULES.map((m) => m.indicator);
}
