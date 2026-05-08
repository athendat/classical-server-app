import 'reflect-metadata';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';
import { RolesController } from './roles.controller';

/**
 * Issue #27 — los métodos del RolesController llevaban @Permissions(...) pero
 * el PermissionsGuard nunca se ejecutaba porque sólo estaba JwtAuthGuard.
 */
describe('RolesController authorization metadata', () => {
  const guards: unknown[] =
    Reflect.getMetadata('__guards__', RolesController) || [];

  it('aplica JwtAuthGuard a nivel de clase', () => {
    expect(guards).toContain(JwtAuthGuard);
  });

  it('aplica PermissionsGuard a nivel de clase', () => {
    expect(guards).toContain(PermissionsGuard);
  });
});
