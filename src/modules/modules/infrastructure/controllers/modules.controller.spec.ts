import 'reflect-metadata';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PERMISSIONS_KEY } from 'src/modules/auth/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';
import { ModulesController } from './modules.controller';

/**
 * Issue #27 — los métodos de gestión de módulos estaban abiertos a cualquier
 * usuario autenticado. Sólo el endpoint /modules/navigation debe quedar
 * accesible sin permiso (lo consume cualquier sesión para construir su sidebar).
 */
describe('ModulesController authorization metadata', () => {
  const guards: unknown[] =
    Reflect.getMetadata('__guards__', ModulesController) || [];

  it('aplica JwtAuthGuard a nivel de clase', () => {
    expect(guards).toContain(JwtAuthGuard);
  });

  it('aplica PermissionsGuard a nivel de clase', () => {
    expect(guards).toContain(PermissionsGuard);
  });

  it('getNavigation NO declara permisos (debe ser accesible a todo autenticado)', () => {
    const handler = (ModulesController.prototype as any).getNavigation;
    const permissions: string[] | undefined = Reflect.getMetadata(
      PERMISSIONS_KEY,
      handler,
    );

    expect(permissions).toBeUndefined();
  });

  describe.each([
    ['findAll', 'modules.read'],
    ['findSystemModules', 'modules.read'],
    ['findById', 'modules.read'],
    ['create', 'modules.create'],
    ['update', 'modules.update'],
    ['reorderModules', 'modules.update'],
    ['disable', 'modules.disable'],
    ['delete', 'modules.delete'],
  ])('%s exige el permiso %s', (method, expectedPermission) => {
    it(`declara @Permissions('${expectedPermission}')`, () => {
      const handler = (ModulesController.prototype as any)[method];
      const permissions: string[] | undefined = Reflect.getMetadata(
        PERMISSIONS_KEY,
        handler,
      );

      expect(permissions).toBeDefined();
      expect(permissions).toContain(expectedPermission);
    });
  });
});
