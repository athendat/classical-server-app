import 'reflect-metadata';
import { GLOBAL_MODULE_METADATA } from '@nestjs/common/constants';
import { PermissionsModule } from './permissions.module';

/**
 * Issue #33 — el server fallaba en bootstrap porque AuditModule, RolesModule
 * y UsersModule activaron @UseGuards(PermissionsGuard) en sus controllers
 * sin tener PermissionsService disponible en su contexto. Importar
 * PermissionsModule recíprocamente provocaría un ciclo (PermissionsModule
 * ya importa AuditModule). La solución elegida es marcar PermissionsModule
 * como @Global() para que sus exports sean visibles en cualquier módulo.
 *
 * Este test es una guarda de regresión: si alguien quita el @Global() sin
 * proporcionar otra ruta de DI (por ejemplo APP_GUARD), bootstrap volverá
 * a romperse.
 */
describe('PermissionsModule', () => {
  it('está marcado como @Global() para evitar el ciclo Audit ↔ Permissions', () => {
    // NestJS guarda el flag de módulo global con la metadata key
    // GLOBAL_MODULE_METADATA = '__module:global__'.
    const isGlobal = Reflect.getMetadata(
      GLOBAL_MODULE_METADATA,
      PermissionsModule,
    );
    expect(isGlobal).toBe(true);
  });
});
