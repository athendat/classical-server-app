import { deriveUserLastActive } from './derive-user-last-active';

/**
 * Issue #30 — la columna "Last Active" del listado de usuarios siempre
 * estaba vacía. Derivamos el dato de la última sesión registrada del
 * usuario (campo virtual `lastSession.loginTimestamp`).
 */
describe('deriveUserLastActive', () => {
  it('devuelve loginTimestamp de la última sesión cuando existe', () => {
    const ts = new Date('2026-04-30T10:00:00Z');
    const user = { lastSession: { loginTimestamp: ts } } as any;

    expect(deriveUserLastActive(user)).toEqual(ts);
  });

  it('prefiere user.lastActive si está presente y es más reciente', () => {
    const sessionTs = new Date('2026-04-30T10:00:00Z');
    const userTs = new Date('2026-05-01T08:00:00Z');
    const user = {
      lastActive: userTs,
      lastSession: { loginTimestamp: sessionTs },
    } as any;

    expect(deriveUserLastActive(user)).toEqual(userTs);
  });

  it('cae a sesión cuando user.lastActive es más antiguo', () => {
    const sessionTs = new Date('2026-05-01T08:00:00Z');
    const userTs = new Date('2026-04-30T10:00:00Z');
    const user = {
      lastActive: userTs,
      lastSession: { loginTimestamp: sessionTs },
    } as any;

    expect(deriveUserLastActive(user)).toEqual(sessionTs);
  });

  it('devuelve null cuando el usuario nunca tuvo sesión ni actividad', () => {
    const user = {} as any;
    expect(deriveUserLastActive(user)).toBeNull();
  });

  it('admite lastSession pero sin loginTimestamp', () => {
    const user = { lastSession: {} } as any;
    expect(deriveUserLastActive(user)).toBeNull();
  });
});
