import 'reflect-metadata';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PERMISSIONS_KEY } from 'src/modules/auth/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';
import { UsersController } from './users.controller';

/**
 * Issue #27 — el listado y CRUD de usuarios estaban accesibles a cualquier
 * usuario autenticado. Esta suite verifica los decoradores que cierran la fuga.
 */
describe('UsersController authorization metadata', () => {
  const guards: unknown[] =
    Reflect.getMetadata('__guards__', UsersController) || [];

  it('aplica JwtAuthGuard a nivel de clase', () => {
    expect(guards).toContain(JwtAuthGuard);
  });

  it('aplica PermissionsGuard a nivel de clase', () => {
    expect(guards).toContain(PermissionsGuard);
  });

  describe.each([
    ['create', 'users.create'],
    ['getUser', 'users.view'],
    ['listUsers', 'users.view'],
    ['updateRoles', 'users.assign-roles'],
    ['updateUser', 'users.edit'],
    ['updatePassword', 'users.edit'],
    ['deleteUser', 'users.delete'],
    ['transitionState', 'users.edit'],
    ['getLifecycle', 'users.view'],
  ])('%s exige el permiso %s', (method, expectedPermission) => {
    it(`declara @Permissions('${expectedPermission}')`, () => {
      const handler = (UsersController.prototype as any)[method];
      const permissions: string[] | undefined = Reflect.getMetadata(
        PERMISSIONS_KEY,
        handler,
      );

      expect(permissions).toBeDefined();
      expect(permissions).toContain(expectedPermission);
    });
  });
});
