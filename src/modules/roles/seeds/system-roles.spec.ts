import { SYSTEM_ROLES } from './system-roles';
import { MODULES } from '../../modules/domain/constants/module.constants';

/**
 * Issue #27 (follow-up SECURITY) — `GET /tenants`, `GET /tenants/:id` y
 * `GET /tenants/:id/lifecycle` deben ser admin-only. Esa propiedad se sostiene
 * en el gate de permisos del controlador (`@Permissions('tenants.read')`): los
 * roles `merchant`/`user` NO tienen `tenants.read`, así que el PermissionsGuard
 * los rechaza (403) antes de llegar al servicio. Su acceso al propio negocio va
 * por `my-tenant.*` (GET /tenants/my-tenant), no por los endpoints de plataforma.
 *
 * Este test BLINDA esa propiedad en su fuente (el seed de roles) para que un
 * cambio futuro no vuelva a otorgarle a un comercio lectura de TODOS los tenants
 * — que fue la evidencia original del #27. No se añade un guard a nivel de
 * servicio porque (a) sería redundante con el gate de permisos y (b) produciría
 * falsos positivos: un operador de plataforma (ops/admin) que crea un tenant
 * queda ligado a él (createTenant -> addTenantIdToUser) y el Actor del request
 * no expone roleKey para eximirlo.
 */
describe('SYSTEM_ROLES — aislamiento de tenants (#27)', () => {
    const TENANTS_READ = `${MODULES.TENANTS}.read`;
    const TENANTS_WILDCARD = `${MODULES.TENANTS}.*`;
    const MY_TENANT_READ = `${MODULES.MY_TENANT}.read`;

    const roleByKey = (key: string) => {
        const role = SYSTEM_ROLES.find((r) => r.key === key);
        if (!role) throw new Error(`Rol de seed no encontrado: ${key}`);
        return role;
    };

    /** ¿Las permissionKeys otorgan lectura de TODOS los tenants? (directo, wildcard de módulo o global) */
    const grantsTenantsRead = (permissionKeys: string[]): boolean =>
        permissionKeys.includes('*') ||
        permissionKeys.includes(TENANTS_WILDCARD) ||
        permissionKeys.includes(TENANTS_READ);

    it.each(['merchant', 'user'])(
        'el rol "%s" NO puede leer todos los tenants (sin tenants.read / tenants.* / *)',
        (key) => {
            expect(grantsTenantsRead(roleByKey(key).permissionKeys)).toBe(false);
        },
    );

    it.each(['merchant', 'user'])(
        'el rol "%s" sí gestiona su propio negocio vía my-tenant.read',
        (key) => {
            expect(roleByKey(key).permissionKeys).toContain(MY_TENANT_READ);
        },
    );

    it.each(['super_admin', 'admin', 'security_officer', 'ops', 'auditor'])(
        'el rol de plataforma "%s" sí puede leer todos los tenants',
        (key) => {
            expect(grantsTenantsRead(roleByKey(key).permissionKeys)).toBe(true);
        },
    );
});
