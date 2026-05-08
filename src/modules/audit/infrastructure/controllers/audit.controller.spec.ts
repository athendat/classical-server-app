import 'reflect-metadata';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PERMISSIONS_KEY } from 'src/modules/auth/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/modules/permissions/infrastructure/guards/permissions.guard';
import { AuditController } from './audit.controller';

/**
 * Verifica que cada endpoint del AuditController está protegido por
 * JwtAuthGuard + PermissionsGuard y declara el permiso 'audit.read'.
 *
 * Cubre Issue #27 — el log de auditoría devolvía 8505 filas a un
 * comerciante porque los decoradores estaban comentados.
 */
describe('AuditController authorization metadata', () => {
  const guards: unknown[] =
    Reflect.getMetadata('__guards__', AuditController) || [];

  it('aplica JwtAuthGuard a nivel de clase', () => {
    expect(guards).toContain(JwtAuthGuard);
  });

  it('aplica PermissionsGuard a nivel de clase', () => {
    expect(guards).toContain(PermissionsGuard);
  });

  describe.each([
    ['findAll', 'audit.read'],
    ['findById', 'audit.read'],
    ['getSummary', 'audit.read'],
  ])('%s exige el permiso %s', (method, expectedPermission) => {
    it(`declara @Permissions('${expectedPermission}')`, () => {
      const handler = (AuditController.prototype as any)[method];
      const permissions: string[] | undefined = Reflect.getMetadata(
        PERMISSIONS_KEY,
        handler,
      );

      expect(permissions).toBeDefined();
      expect(permissions).toContain(expectedPermission);
    });
  });
});
