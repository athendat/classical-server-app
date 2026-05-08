import 'reflect-metadata';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PERMISSIONS_KEY } from 'src/modules/auth/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';
import { TenantController } from './tenant.controller';

/**
 * Issue #27 — Métodos de gestión de tenants estaban abiertos a cualquier
 * autenticado. Los endpoints "self-service" (my-tenant, credentials propias)
 * permanecen abiertos a cualquier autenticado y se filtran por el actor
 * dentro del servicio; los de gestión global exigen permisos.
 */
describe('TenantController authorization metadata', () => {
  const guards: unknown[] =
    Reflect.getMetadata('__guards__', TenantController) || [];

  it('aplica JwtAuthGuard a nivel de clase', () => {
    expect(guards).toContain(JwtAuthGuard);
  });

  it('aplica PermissionsGuard a nivel de clase', () => {
    expect(guards).toContain(PermissionsGuard);
  });

  describe.each([
    ['create', 'tenants.create'],
    ['list', 'tenants.read'],
    ['getById', 'tenants.read'],
    ['update', 'tenants.write'],
    ['transition', 'tenants.approve'],
    ['getLifecycle', 'tenants.read'],
  ])('%s exige el permiso %s', (method, expectedPermission) => {
    it(`declara @Permissions('${expectedPermission}')`, () => {
      const handler = (TenantController.prototype as any)[method];
      const permissions: string[] | undefined = Reflect.getMetadata(
        PERMISSIONS_KEY,
        handler,
      );

      expect(permissions).toBeDefined();
      expect(permissions).toContain(expectedPermission);
    });
  });

  describe.each([
    ['getMyTenant'],
    ['getCredentials'],
    ['updateCredentials'],
  ])('%s queda accesible a cualquier autenticado (sin @Permissions)', (method) => {
    it('no declara @Permissions', () => {
      const handler = (TenantController.prototype as any)[method];
      const permissions: string[] | undefined = Reflect.getMetadata(
        PERMISSIONS_KEY,
        handler,
      );

      expect(permissions).toBeUndefined();
    });
  });
});
